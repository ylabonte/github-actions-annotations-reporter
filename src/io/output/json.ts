import type {
  Annotation,
  ReconcileAction,
  ReportSummary,
  RepoRef,
  Severity,
} from '../../core/types.js';

export interface JsonReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly repo: RepoRef;
  readonly branch: string;
  readonly summary: ReportSummary;
  readonly actions: readonly SerializedAction[];
  readonly annotations?: readonly SerializedAnnotation[];
}

export interface SerializedAction {
  readonly kind: ReconcileAction['kind'];
  readonly fingerprint: string;
  readonly issueNumber: number | null;
  readonly reason: string;
  readonly severity: string | null;
  readonly workflow: string | null;
  readonly job: string | null;
  readonly path: string | null;
  readonly startLine: number | null;
  readonly runUrl: string | null;
}

export interface SerializedAnnotation {
  readonly fingerprint: string;
  readonly severity: Severity;
  readonly message: string;
  readonly title: string | null;
  readonly rawDetails: string | null;
  readonly path: string;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly workflow: {
    readonly id: number;
    readonly name: string;
    readonly path: string;
  };
  readonly job: {
    readonly id: number;
    readonly name: string;
  };
  readonly run: {
    readonly id: number;
    readonly runNumber: number;
    readonly htmlUrl: string;
    readonly headBranch: string;
    readonly headSha: string;
    readonly conclusion: string | null;
    readonly createdAt: string;
  };
}

export interface BuildJsonReportArgs {
  readonly repo: RepoRef;
  readonly branch: string;
  readonly summary: ReportSummary;
  readonly actions: readonly ReconcileAction[];
  readonly now: Date;
  readonly includeAnnotations?: boolean;
  readonly annotations?: readonly Annotation[];
}

export function buildJsonReport(args: BuildJsonReportArgs): JsonReport {
  const base: JsonReport = {
    schemaVersion: 1,
    generatedAt: args.now.toISOString(),
    repo: args.repo,
    branch: args.branch,
    summary: args.summary,
    actions: args.actions.map((a) => serializeAction(a)),
  };
  if (args.includeAnnotations) {
    return {
      ...base,
      annotations: (args.annotations ?? []).map((a) => serializeAnnotation(a)),
    };
  }
  return base;
}

function serializeAction(a: ReconcileAction): SerializedAction {
  const ann = a.annotation;
  return {
    kind: a.kind,
    fingerprint: a.fingerprint,
    issueNumber: a.issueNumber,
    reason: a.reason,
    severity: ann?.severity ?? null,
    workflow: ann?.workflow.path ?? a.priorIssue?.parsedState?.workflowPath ?? null,
    job: ann?.job.name ?? null,
    path: ann?.path ?? null,
    startLine: ann?.startLine ?? null,
    runUrl: ann?.run.htmlUrl ?? null,
  };
}

export function serializeAnnotation(a: Annotation): SerializedAnnotation {
  return {
    fingerprint: a.fingerprint,
    severity: a.severity,
    message: a.message,
    title: a.title,
    rawDetails: a.rawDetails,
    path: a.path,
    startLine: a.startLine,
    endLine: a.endLine,
    workflow: {
      id: a.workflow.id,
      name: a.workflow.name,
      path: a.workflow.path,
    },
    job: {
      id: a.job.id,
      name: a.job.name,
    },
    run: {
      id: a.run.id,
      runNumber: a.run.runNumber,
      htmlUrl: a.run.htmlUrl,
      headBranch: a.run.headBranch,
      headSha: a.run.headSha,
      conclusion: a.run.conclusion,
      createdAt: a.run.createdAt,
    },
  };
}
