import pc from 'picocolors';
import type { Annotation } from '../../core/types.js';
import { colorSeverity } from './formatter.js';

const NONE = '(none)';
const NO_FILE = '(no file)';
const DIVIDER_WIDTH = 60;

/**
 * Per-field render cap for the human-readable listing. Bounds pathological
 * inputs (a multi-megabyte stack trace, a binary blob smuggled into a
 * `raw_details`) so the terminal doesn't lock up. JSON output is unaffected;
 * consumers reading `--json` see the full payload.
 */
export const MAX_RENDERED_FIELD_BYTES = 4 * 1024;

export function renderAnnotationsList(annotations: readonly Annotation[]): string {
  if (annotations.length === 0) return '(no annotations)';
  return annotations.map((a, i) => renderBlock(a, i + 1)).join('\n\n');
}

function renderBlock(annotation: Annotation, index: number): string {
  const conclusion = annotation.run.conclusion ?? '(no conclusion)';
  const shortSha = annotation.run.headSha.slice(0, 7);
  const message = truncate(annotation.message, MAX_RENDERED_FIELD_BYTES);
  const lines: string[] = [
    divider(index),
    `  Severity:    ${colorSeverity(annotation.severity, annotation.severity)}`,
    `  Fingerprint: ${annotation.fingerprint}`,
    `  Workflow:    ${annotation.workflow.path} (${annotation.workflow.name})`,
    `  Job:         ${annotation.job.name}`,
    `  Run:         #${annotation.run.runNumber.toString()} — ${conclusion} — ${annotation.run.htmlUrl}`,
    `  Branch:      ${annotation.run.headBranch} @ ${shortSha}`,
    `  Path:        ${formatPath(annotation)}`,
    `  Title:       ${annotation.title ?? NONE}`,
    `  Message:`,
    indent(message.body),
    ...(message.truncated ? [indent(truncationMarker(message.elidedBytes))] : []),
  ];
  if (annotation.rawDetails !== null) {
    const details = truncate(annotation.rawDetails, MAX_RENDERED_FIELD_BYTES);
    lines.push(`  Raw details:`, indent(details.body));
    if (details.truncated) {
      lines.push(indent(truncationMarker(details.elidedBytes)));
    }
  }
  return lines.join('\n');
}

function divider(index: number): string {
  const label = ` Annotation ${index.toString()} `;
  const trailing = Math.max(0, DIVIDER_WIDTH - label.length - 2);
  return pc.dim(`──${label}${'─'.repeat(trailing)}`);
}

function formatPath(annotation: Annotation): string {
  if (!annotation.path) return NO_FILE;
  if (annotation.startLine == null) return annotation.path;
  if (annotation.endLine == null || annotation.endLine === annotation.startLine) {
    return `${annotation.path} (line ${annotation.startLine.toString()})`;
  }
  return `${annotation.path} (lines ${annotation.startLine.toString()}–${annotation.endLine.toString()})`;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}

interface Truncated {
  readonly body: string;
  readonly truncated: boolean;
  readonly elidedBytes: number;
}

function truncate(text: string, max: number): Truncated {
  if (text.length <= max) return { body: text, truncated: false, elidedBytes: 0 };
  return { body: text.slice(0, max), truncated: true, elidedBytes: text.length - max };
}

function truncationMarker(elidedBytes: number): string {
  return pc.dim(
    `… (truncated, ${elidedBytes.toString()} more bytes — use --json for the full payload)`,
  );
}
