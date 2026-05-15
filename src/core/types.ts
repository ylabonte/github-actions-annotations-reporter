export type AnnotationLevel = 'notice' | 'warning' | 'failure';
export type Severity = 'notice' | 'warning' | 'error';

export const SEVERITY_ORDER: Record<Severity, number> = { notice: 0, warning: 1, error: 2 };

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

export interface WorkflowInfo {
  readonly id: number;
  readonly name: string;
  /** Repo-relative POSIX path, e.g. `.github/workflows/ci.yml`. */
  readonly path: string;
  readonly state: string;
}

export type RunConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'startup_failure'
  | 'stale'
  | null;

export interface RunInfo {
  readonly id: number;
  readonly runNumber: number;
  readonly htmlUrl: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly conclusion: RunConclusion;
  readonly createdAt: string;
}

export interface JobInfo {
  readonly id: number;
  readonly name: string;
  readonly checkRunId: number;
}

export interface RawAnnotation {
  readonly level: AnnotationLevel;
  readonly message: string;
  readonly title: string | null;
  readonly rawDetails: string | null;
  readonly path: string;
  readonly startLine: number | null;
  readonly endLine: number | null;
}

export interface Annotation {
  readonly severity: Severity;
  readonly message: string;
  readonly title: string | null;
  readonly rawDetails: string | null;
  readonly path: string;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly workflow: WorkflowInfo;
  readonly job: JobInfo;
  readonly run: RunInfo;
  readonly fingerprint: string;
}

export interface IssueState {
  readonly lastSeenAt: string;
  readonly missCounter: number;
  readonly firstSeenAt: string;
  readonly workflowPath: string;
}

export interface IssueRecord {
  readonly number: number;
  readonly state: 'open' | 'closed';
  readonly stateReason: 'completed' | 'not_planned' | 'reopened' | null;
  readonly labels: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly fingerprint: string | null;
  readonly parsedState: IssueState | null;
  readonly htmlUrl: string;
  readonly closedAt: string | null;
  readonly updatedAt: string;
}

export type ReconcileActionKind =
  | 'create'
  | 'update'
  | 'reopen'
  | 'suppressed'
  | 'auto-close'
  | 'auto-close-hold';

export interface ReconcileAction {
  readonly kind: ReconcileActionKind;
  readonly fingerprint: string;
  readonly issueNumber: number | null;
  readonly annotation: Annotation | null;
  readonly priorIssue: IssueRecord | null;
  readonly reason: string;
}

export interface ReportSummary {
  readonly totalAnnotations: number;
  readonly newIssues: number;
  readonly updatedIssues: number;
  readonly reopenedIssues: number;
  readonly suppressed: number;
  readonly autoClosed: number;
  readonly autoCloseHeld: number;
  readonly dryRun: boolean;
}
