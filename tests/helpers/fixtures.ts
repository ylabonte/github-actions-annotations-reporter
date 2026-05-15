import type {
  Annotation,
  IssueRecord,
  IssueState,
  JobInfo,
  RawAnnotation,
  RepoRef,
  RunInfo,
  Severity,
  WorkflowInfo,
} from '../../src/core/types.js';
import { computeFingerprint } from '../../src/core/fingerprint.js';

export const REPO: RepoRef = { owner: 'ylabonte', repo: 'demo' };

export function makeWorkflow(overrides: Partial<WorkflowInfo> = {}): WorkflowInfo {
  return {
    id: 1,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    state: 'active',
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    id: 100,
    runNumber: 42,
    htmlUrl: 'https://github.com/ylabonte/demo/actions/runs/100',
    headBranch: 'main',
    headSha: 'a'.repeat(40),
    conclusion: 'success',
    createdAt: '2026-05-15T10:00:00Z',
    ...overrides,
  };
}

export function makeJob(overrides: Partial<JobInfo> = {}): JobInfo {
  return { id: 200, name: 'lint', checkRunId: 300, ...overrides };
}

export function makeRawAnnotation(overrides: Partial<RawAnnotation> = {}): RawAnnotation {
  return {
    level: 'warning',
    message: 'Deprecated API usage',
    title: null,
    rawDetails: null,
    path: 'src/foo.ts',
    startLine: 42,
    endLine: 42,
    ...overrides,
  };
}

export function makeAnnotation(
  overrides: Partial<Annotation> & { severity?: Severity } = {},
): Annotation {
  const workflow = overrides.workflow ?? makeWorkflow();
  const job = overrides.job ?? makeJob();
  const run = overrides.run ?? makeRun();
  const raw = makeRawAnnotation({
    ...(overrides.path === undefined ? {} : { path: overrides.path }),
    ...(overrides.message === undefined ? {} : { message: overrides.message }),
    ...(overrides.startLine === undefined ? {} : { startLine: overrides.startLine }),
    level: overrides.severity === 'error' ? 'failure' : (overrides.severity ?? 'warning'),
  });
  return {
    severity: overrides.severity ?? 'warning',
    message: raw.message,
    title: raw.title,
    rawDetails: raw.rawDetails,
    path: raw.path,
    startLine: raw.startLine,
    endLine: raw.endLine,
    workflow,
    job,
    run,
    fingerprint: computeFingerprint(workflow, raw),
    ...overrides,
  };
}

export function makeIssueState(overrides: Partial<IssueState> = {}): IssueState {
  return {
    lastSeenAt: '2026-05-08T10:00:00Z',
    missCounter: 0,
    firstSeenAt: '2026-05-01T10:00:00Z',
    workflowPath: '.github/workflows/ci.yml',
    ...overrides,
  };
}

export function makeIssue(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    number: 1,
    state: 'open',
    stateReason: null,
    labels: ['automation/annotation-reporter', 'severity/warning'],
    title: '[Warning] src/foo.ts: Deprecated API usage',
    body: '<!-- annot-id: sha256:deadbeef -->',
    fingerprint: 'deadbeef',
    parsedState: makeIssueState(),
    htmlUrl: 'https://github.com/ylabonte/demo/issues/1',
    closedAt: null,
    updatedAt: '2026-05-08T10:00:00Z',
    ...overrides,
  };
}
