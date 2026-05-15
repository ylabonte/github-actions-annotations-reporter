import type {
  Annotation,
  IssueRecord,
  IssueState,
  ReconcileAction,
  RunInfo,
  Severity,
} from './types.js';
import {
  evaluateAutoClose,
  type AutoCloseConfig,
  type AutoCloseDecision,
} from './auto-close-policy.js';
import { detectWontfix, type WontfixConfig } from './wontfix-detector.js';

export interface ReconcileInputs {
  readonly annotations: readonly Annotation[];
  readonly priorIssues: readonly IssueRecord[];
  readonly wontfix: WontfixConfig;
  readonly autoClose: AutoCloseConfig;
  readonly latestRunByWorkflowPath: ReadonlyMap<string, RunInfo | null>;
  readonly scannedWorkflowPaths: ReadonlySet<string>;
  readonly now: Date;
  readonly fetchClosingComment: (issueNumber: number) => Promise<string | null>;
}

export interface ReconcileResult {
  readonly actions: ReconcileAction[];
}

export async function reconcile(inputs: ReconcileInputs): Promise<ReconcileResult> {
  const {
    annotations,
    priorIssues,
    wontfix,
    autoClose,
    latestRunByWorkflowPath,
    scannedWorkflowPaths,
    now,
    fetchClosingComment,
  } = inputs;

  const issuesByFingerprint = new Map<string, IssueRecord>();
  for (const issue of priorIssues) {
    if (issue.fingerprint) issuesByFingerprint.set(issue.fingerprint, issue);
  }

  const annotationByFingerprint = new Map<string, Annotation>();
  for (const a of annotations) annotationByFingerprint.set(a.fingerprint, a);

  const actions: ReconcileAction[] = [];

  // First pass: seen annotations → create / update / reopen / suppressed.
  for (const annotation of annotations) {
    const prior = issuesByFingerprint.get(annotation.fingerprint);
    if (!prior) {
      actions.push({
        kind: 'create',
        fingerprint: annotation.fingerprint,
        issueNumber: null,
        annotation,
        priorIssue: null,
        reason: 'no prior issue for this fingerprint',
      });
      continue;
    }
    if (prior.state === 'open') {
      actions.push({
        kind: 'update',
        fingerprint: annotation.fingerprint,
        issueNumber: prior.number,
        annotation,
        priorIssue: prior,
        reason: 'existing open issue refreshed',
      });
      continue;
    }
    // closed → check wontfix
    const decision = await detectWontfix({
      issue: prior,
      config: wontfix,
      fetchClosingComment: () => fetchClosingComment(prior.number),
    });
    if (decision.suppressed) {
      actions.push({
        kind: 'suppressed',
        fingerprint: annotation.fingerprint,
        issueNumber: prior.number,
        annotation,
        priorIssue: prior,
        reason: `suppressed (${decision.signal ?? 'unknown'}): ${decision.detail}`,
      });
    } else {
      actions.push({
        kind: 'reopen',
        fingerprint: annotation.fingerprint,
        issueNumber: prior.number,
        annotation,
        priorIssue: prior,
        reason: `prior closed issue reopened; ${decision.detail}`,
      });
    }
  }

  // Vanish pass: open managed issues whose fingerprint was NOT seen this run.
  for (const issue of priorIssues) {
    if (issue.state !== 'open') continue;
    if (!issue.fingerprint) continue;
    if (annotationByFingerprint.has(issue.fingerprint)) continue;

    const workflowPath = issue.parsedState?.workflowPath ?? null;
    const workflowInScope = workflowPath != null && scannedWorkflowPaths.has(workflowPath);
    const latestRun = workflowPath ? (latestRunByWorkflowPath.get(workflowPath) ?? null) : null;

    const decision: AutoCloseDecision = evaluateAutoClose({
      issue,
      config: autoClose,
      workflowLatestRun: latestRun,
      workflowInScope,
      now,
    });

    if (decision.kind === 'close') {
      actions.push({
        kind: 'auto-close',
        fingerprint: issue.fingerprint,
        issueNumber: issue.number,
        annotation: null,
        priorIssue: issue,
        reason: decision.reason,
      });
    } else if (decision.kind === 'hold') {
      actions.push({
        kind: 'auto-close-hold',
        fingerprint: issue.fingerprint,
        issueNumber: issue.number,
        annotation: null,
        priorIssue: issue,
        reason: decision.reason,
      });
    }
    // 'skip' produces no action.
  }

  return { actions };
}

export interface NextIssueStateInput {
  readonly priorState: IssueState | null;
  readonly annotation: Annotation;
  readonly now: Date;
}

export function nextIssueState(input: NextIssueStateInput): IssueState {
  const { priorState, annotation, now } = input;
  const nowIso = now.toISOString();
  return {
    lastSeenAt: nowIso,
    missCounter: 0,
    firstSeenAt: priorState?.firstSeenAt ?? nowIso,
    workflowPath: annotation.workflow.path,
  };
}

export function severityToLabel(severity: Severity): string {
  return `severity/${severity}`;
}
