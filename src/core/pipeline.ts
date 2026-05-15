import { createOctokit, type OctokitInstance } from './github/client.js';
import { getDefaultBranch, resolveRepoFromEnv } from './github/repo.js';
import {
  addIssueComment,
  createIssue,
  ensureLabel,
  getClosingComment,
  listManagedIssues,
  updateIssue,
} from './github/issues.js';
import { resolveAuth } from './auth.js';
import { collectAnnotations } from './annotation-collector.js';
import { nextIssueState, reconcile, severityToLabel, type ReconcileResult } from './reconciler.js';
import { renderAutoCloseComment } from './auto-close-policy.js';
import {
  parseOccurrences,
  renderIssueBody,
  renderIssueTitle,
  type OccurrenceEntry,
} from '../io/issue-body.js';
import type {
  Annotation,
  Severity,
  IssueRecord,
  IssueState,
  ReconcileAction,
  RepoRef,
  ReportSummary,
} from './types.js';
import type { ResolvedConfig } from './config.js';
import { NOOP_PROGRESS, type ProgressReporter } from '../io/progress.js';

const ALL_SEVERITIES: readonly Severity[] = ['notice', 'warning', 'error'];

export interface RunPipelineOptions {
  readonly config: ResolvedConfig;
  readonly explicitToken?: string;
  readonly explicitRepo?: RepoRef;
  readonly dryRun: boolean;
  readonly applyMode: boolean;
  readonly now?: Date;
  readonly octokit?: OctokitInstance;
  readonly progress?: ProgressReporter;
}

export interface RunPipelineResult {
  readonly summary: ReportSummary;
  readonly actions: readonly ReconcileAction[];
  readonly annotations: readonly Annotation[];
  readonly repo: RepoRef;
  readonly branch: string;
}

export async function runPipeline(options: RunPipelineOptions): Promise<RunPipelineResult> {
  const now = options.now ?? new Date();
  const progress = options.progress ?? NOOP_PROGRESS;
  const auth = await resolveAuth({ explicitToken: options.explicitToken ?? '' });

  const repo = options.explicitRepo ?? resolveRepoFromEnv();
  if (!repo) {
    throw new Error(
      'Could not determine the target repository. Set GITHUB_REPOSITORY or pass --repo owner/name.',
    );
  }

  const octokit = options.octokit ?? createOctokit({ token: auth.token });

  progress.start(`Resolving ${repo.owner}/${repo.repo}…`);
  const branch = options.config.branch ?? (await getDefaultBranch(octokit, repo));
  progress.succeed(`Repository ${repo.owner}/${repo.repo} @ ${branch}`);

  progress.start('Scanning workflows for annotations…');
  const collect = await collectAnnotations(octokit, {
    ref: repo,
    branch,
    filter: { include: options.config.workflows, exclude: options.config.reject },
    minSeverity: options.config.minSeverity,
    progress,
  });
  progress.succeed(
    `Collected ${collect.annotations.length.toString()} annotation(s) across ${collect.scannedWorkflowPaths.size.toString()} workflow(s)`,
  );

  progress.start('Loading managed issues…');
  const priorIssues = await listManagedIssues(octokit, repo, options.config.managementLabel);
  progress.succeed(`Loaded ${priorIssues.length.toString()} managed issue(s)`);

  progress.start('Reconciling annotations against issues…');
  const reconcileResult = await reconcile({
    annotations: collect.annotations,
    priorIssues,
    wontfix: options.config.wontfix,
    autoClose: options.config.autoClose,
    latestRunByWorkflowPath: collect.latestRunByWorkflowPath,
    scannedWorkflowPaths: collect.scannedWorkflowPaths,
    now,
    fetchClosingComment: (issueNumber) => getClosingComment(octokit, repo, issueNumber),
  });
  progress.succeed(`Planned ${reconcileResult.actions.length.toString()} action(s)`);

  let summary: ReportSummary = {
    totalAnnotations: collect.annotations.length,
    newIssues: 0,
    updatedIssues: 0,
    reopenedIssues: 0,
    suppressed: 0,
    autoClosed: 0,
    autoCloseHeld: 0,
    dryRun: options.dryRun,
  };

  if (!options.applyMode || options.dryRun) {
    summary = tallyDryRun(summary, reconcileResult);
    return {
      summary,
      actions: reconcileResult.actions,
      annotations: collect.annotations,
      repo,
      branch,
    };
  }

  progress.start('Ensuring labels exist…');
  await ensureManagementAndSeverityLabels(octokit, repo, options.config.managementLabel);
  progress.succeed('Labels in place');

  progress.start('Applying changes…');
  summary = await applyActions({
    octokit,
    repo,
    actions: reconcileResult.actions,
    config: options.config,
    now,
    summary,
    progress,
  });
  const writes =
    summary.newIssues + summary.updatedIssues + summary.reopenedIssues + summary.autoClosed;
  progress.succeed(
    `Applied ${writes.toString()} write(s) (${summary.newIssues.toString()} new, ${summary.updatedIssues.toString()} updated, ${summary.reopenedIssues.toString()} reopened, ${summary.autoClosed.toString()} auto-closed)`,
  );

  return {
    summary,
    actions: reconcileResult.actions,
    annotations: collect.annotations,
    repo,
    branch,
  };
}

function tallyDryRun(summary: ReportSummary, result: ReconcileResult): ReportSummary {
  let { newIssues, updatedIssues, reopenedIssues, suppressed, autoClosed, autoCloseHeld } = summary;
  for (const a of result.actions) {
    switch (a.kind) {
      case 'create': {
        newIssues += 1;
        break;
      }
      case 'update': {
        updatedIssues += 1;
        break;
      }
      case 'reopen': {
        reopenedIssues += 1;
        break;
      }
      case 'suppressed': {
        suppressed += 1;
        break;
      }
      case 'auto-close': {
        autoClosed += 1;
        break;
      }
      case 'auto-close-hold': {
        autoCloseHeld += 1;
        break;
      }
    }
  }
  return {
    ...summary,
    newIssues,
    updatedIssues,
    reopenedIssues,
    suppressed,
    autoClosed,
    autoCloseHeld,
  };
}

interface ApplyArgs {
  readonly octokit: OctokitInstance;
  readonly repo: RepoRef;
  readonly actions: readonly ReconcileAction[];
  readonly config: ResolvedConfig;
  readonly now: Date;
  readonly summary: ReportSummary;
  readonly progress: ProgressReporter;
}

async function applyActions(args: ApplyArgs): Promise<ReportSummary> {
  const { octokit, repo, actions, config, now, progress } = args;
  const today = now.toISOString().slice(0, 10);
  let summary = args.summary;
  let writeBudget = config.maxIssues;

  for (const [index, action] of actions.entries()) {
    progress.update(
      `Applying ${action.kind} (${(index + 1).toString()}/${actions.length.toString()})`,
    );
    if (action.kind === 'create' || action.kind === 'update' || action.kind === 'reopen') {
      if (writeBudget <= 0) {
        // Convert to "held" so users can see they hit the cap rather than silently dropping.
        continue;
      }
      writeBudget -= 1;
    }

    if (action.kind === 'create' && action.annotation) {
      const body = renderNewIssueBody(action.annotation, now, today);
      await createIssue(octokit, repo, {
        title: renderIssueTitle(action.annotation),
        body,
        labels: [config.managementLabel, severityToLabel(action.annotation.severity)],
      });
      summary = { ...summary, newIssues: summary.newIssues + 1 };
      continue;
    }

    if (action.kind === 'update' && action.annotation && action.priorIssue) {
      const body = renderRefreshedBody(action.annotation, action.priorIssue, now, today);
      await updateIssue(octokit, repo, {
        issueNumber: action.priorIssue.number,
        body,
        labels: mergeLabels(action.priorIssue.labels, [
          config.managementLabel,
          severityToLabel(action.annotation.severity),
        ]),
      });
      summary = { ...summary, updatedIssues: summary.updatedIssues + 1 };
      continue;
    }

    if (action.kind === 'reopen' && action.annotation && action.priorIssue) {
      const body = renderRefreshedBody(action.annotation, action.priorIssue, now, today);
      await updateIssue(octokit, repo, {
        issueNumber: action.priorIssue.number,
        body,
        state: 'open',
        stateReason: 'reopened',
        labels: mergeLabels(action.priorIssue.labels, [
          config.managementLabel,
          severityToLabel(action.annotation.severity),
        ]),
      });
      summary = { ...summary, reopenedIssues: summary.reopenedIssues + 1 };
      continue;
    }

    if (action.kind === 'suppressed') {
      summary = { ...summary, suppressed: summary.suppressed + 1 };
      continue;
    }

    if (action.kind === 'auto-close' && action.priorIssue) {
      const newMissCounter = (action.priorIssue.parsedState?.missCounter ?? 0) + 1;
      const lastSeenAt = action.priorIssue.parsedState?.lastSeenAt ?? null;
      await addIssueComment(
        octokit,
        repo,
        action.priorIssue.number,
        renderAutoCloseComment({ missCounter: newMissCounter, lastSeenAt }),
      );
      await updateIssue(octokit, repo, {
        issueNumber: action.priorIssue.number,
        state: 'closed',
        stateReason: 'completed',
      });
      summary = { ...summary, autoClosed: summary.autoClosed + 1 };
      continue;
    }

    if (action.kind === 'auto-close-hold' && action.priorIssue) {
      const priorState = action.priorIssue.parsedState;
      const updatedState: IssueState = {
        lastSeenAt: priorState?.lastSeenAt ?? now.toISOString(),
        missCounter: (priorState?.missCounter ?? 0) + 1,
        firstSeenAt: priorState?.firstSeenAt ?? now.toISOString(),
        workflowPath: priorState?.workflowPath ?? '',
      };
      const newBody = rewriteStateMarker(action.priorIssue.body, updatedState);
      if (newBody !== action.priorIssue.body) {
        await updateIssue(octokit, repo, {
          issueNumber: action.priorIssue.number,
          body: newBody,
        });
      }
      summary = { ...summary, autoCloseHeld: summary.autoCloseHeld + 1 };
    }
  }

  return summary;
}

function renderNewIssueBody(annotation: Annotation, now: Date, today: string): string {
  const state: IssueState = {
    lastSeenAt: now.toISOString(),
    missCounter: 0,
    firstSeenAt: now.toISOString(),
    workflowPath: annotation.workflow.path,
  };
  return renderIssueBody({
    fingerprint: annotation.fingerprint,
    annotation,
    state,
    occurrences: [
      { date: today, runUrl: annotation.run.htmlUrl, runNumber: annotation.run.runNumber },
    ],
  });
}

function renderRefreshedBody(
  annotation: Annotation,
  prior: IssueRecord,
  now: Date,
  today: string,
): string {
  const prevOccurrences = parseOccurrences(prior.body);
  const merged = mergeOccurrence(prevOccurrences, {
    date: today,
    runUrl: annotation.run.htmlUrl,
    runNumber: annotation.run.runNumber,
  });
  const state = nextIssueState({ priorState: prior.parsedState, annotation, now });
  return renderIssueBody({
    fingerprint: annotation.fingerprint,
    annotation,
    state,
    occurrences: merged,
  });
}

function mergeOccurrence(
  prev: readonly OccurrenceEntry[],
  next: OccurrenceEntry,
): OccurrenceEntry[] {
  const filtered = prev.filter((p) => p.runNumber !== next.runNumber);
  return [next, ...filtered];
}

function mergeLabels(prior: readonly string[], extras: readonly string[]): string[] {
  const out = new Set(prior);
  // Strip stale severity labels (other than the one we want to keep) so a notice that
  // escalated to a warning loses the `severity/notice` label.
  for (const sev of ALL_SEVERITIES) {
    if (!extras.includes(severityToLabel(sev))) out.delete(severityToLabel(sev));
  }
  for (const e of extras) out.add(e);
  return [...out];
}

function rewriteStateMarker(body: string, state: IssueState): string {
  const json = JSON.stringify(state);
  const replacement = `<!-- annot-state: ${json} -->`;
  if (/<!--\s*annot-state:[^]*?-->/.test(body)) {
    return body.replace(/<!--\s*annot-state:[^]*?-->/, replacement);
  }
  return `${replacement}\n${body}`;
}

async function ensureManagementAndSeverityLabels(
  octokit: OctokitInstance,
  ref: RepoRef,
  managementLabel: string,
): Promise<void> {
  await ensureLabel(
    octokit,
    ref,
    managementLabel,
    '0e8a16',
    'Issues managed by github-actions-annotations-reporter.',
  );
  await ensureLabel(octokit, ref, 'severity/notice', 'c5def5', 'Annotation severity: notice.');
  await ensureLabel(octokit, ref, 'severity/warning', 'fbca04', 'Annotation severity: warning.');
  await ensureLabel(octokit, ref, 'severity/error', 'd93f0b', 'Annotation severity: error.');
}
