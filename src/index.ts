export { runPipeline, type RunPipelineOptions, type RunPipelineResult } from './core/pipeline.js';
export {
  ConfigSchema,
  loadConfig,
  mergeWithOverrides,
  type ResolvedConfig,
} from './core/config.js';
export { computeFingerprint, normalizeMessage } from './core/fingerprint.js';
export {
  detectWontfix,
  type WontfixConfig,
  type WontfixDecision,
  type WontfixSignal,
} from './core/wontfix-detector.js';
export {
  evaluateAutoClose,
  renderAutoCloseComment,
  type AutoCloseConfig,
  type AutoCloseDecision,
} from './core/auto-close-policy.js';
export { reconcile, severityToLabel, type ReconcileInputs } from './core/reconciler.js';
export {
  parseFingerprintMarker,
  parseIssueState,
  parseOccurrences,
  renderIssueBody,
  renderIssueTitle,
  severityLabel,
} from './io/issue-body.js';
export {
  buildJsonReport,
  type JsonReport,
  type SerializedAction,
  type SerializedAnnotation,
} from './io/output/json.js';
export type {
  Annotation,
  AnnotationLevel,
  IssueRecord,
  IssueState,
  ReconcileAction,
  ReconcileActionKind,
  ReportSummary,
  RepoRef,
  RunInfo,
  Severity,
  WorkflowInfo,
} from './core/types.js';
