import type { OctokitInstance } from './github/client.js';
import { listAnnotationsForCheckRun, listJobsForRun } from './github/annotations.js';
import { getLatestCompletedRun, listRepoWorkflows } from './github/workflows.js';
import { workflowMatchesFilter, type WorkflowFilter } from './minimatch-lite.js';
import { computeFingerprint } from './fingerprint.js';
import type { Annotation, AnnotationLevel, RepoRef, RunInfo, Severity } from './types.js';
import { SEVERITY_ORDER } from './types.js';
import { NOOP_PROGRESS, type ProgressReporter } from '../io/progress.js';

export interface CollectOptions {
  readonly ref: RepoRef;
  readonly branch: string;
  readonly filter: WorkflowFilter;
  readonly minSeverity: Severity;
  readonly progress?: ProgressReporter;
}

export interface CollectResult {
  readonly annotations: Annotation[];
  /** Map of workflow path → latest run (used by the auto-close vanish pass). */
  readonly latestRunByWorkflowPath: Map<string, RunInfo | null>;
  /** Workflow paths that matched the filter this scan. */
  readonly scannedWorkflowPaths: ReadonlySet<string>;
}

export async function collectAnnotations(
  octokit: OctokitInstance,
  options: CollectOptions,
): Promise<CollectResult> {
  const progress = options.progress ?? NOOP_PROGRESS;
  const allWorkflows = await listRepoWorkflows(octokit, options.ref);
  const scoped = allWorkflows.filter((wf) =>
    workflowMatchesFilter(wf.name, wf.path, options.filter),
  );

  const minRank = SEVERITY_ORDER[options.minSeverity];
  const annotations: Annotation[] = [];
  const latestRunByWorkflowPath = new Map<string, RunInfo | null>();
  const scannedWorkflowPaths = new Set<string>();

  for (const [index, wf] of scoped.entries()) {
    progress.update(`Scanning ${wf.path} (${(index + 1).toString()}/${scoped.length.toString()})`);
    scannedWorkflowPaths.add(wf.path);
    const run = await getLatestCompletedRun(octokit, options.ref, wf.id, options.branch);
    latestRunByWorkflowPath.set(wf.path, run);
    if (!run) continue;

    const jobs = await listJobsForRun(octokit, options.ref, run.id);
    for (const job of jobs) {
      const raw = await listAnnotationsForCheckRun(octokit, options.ref, job.checkRunId);
      for (const r of raw) {
        const severity = levelToSeverity(r.level);
        if (SEVERITY_ORDER[severity] < minRank) continue;
        annotations.push({
          severity,
          message: r.message,
          title: r.title,
          rawDetails: r.rawDetails,
          path: r.path,
          startLine: r.startLine,
          endLine: r.endLine,
          workflow: wf,
          job,
          run,
          fingerprint: computeFingerprint(wf, r),
        });
      }
    }
  }

  return {
    annotations: dedupeByFingerprint(annotations),
    latestRunByWorkflowPath,
    scannedWorkflowPaths,
  };
}

function levelToSeverity(level: AnnotationLevel): Severity {
  return level === 'failure' ? 'error' : level;
}

function dedupeByFingerprint(annotations: readonly Annotation[]): Annotation[] {
  const seen = new Map<string, Annotation>();
  for (const a of annotations) {
    const prev = seen.get(a.fingerprint);
    if (!prev) {
      seen.set(a.fingerprint, a);
      continue;
    }
    // Keep the highest-severity representative; ties broken by most recent run.
    const prevRank = SEVERITY_ORDER[prev.severity];
    const nextRank = SEVERITY_ORDER[a.severity];
    if (nextRank > prevRank) {
      seen.set(a.fingerprint, a);
    } else if (
      nextRank === prevRank &&
      Date.parse(a.run.createdAt) > Date.parse(prev.run.createdAt)
    ) {
      seen.set(a.fingerprint, a);
    }
  }
  return [...seen.values()];
}

// Re-export so callers don't need to import from a deeper path.

export { type WorkflowInfo } from './types.js';
