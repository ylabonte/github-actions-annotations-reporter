import pc from 'picocolors';
import type { Annotation } from '../../core/types.js';
import { colorSeverity } from './formatter.js';

const NONE = '(none)';
const NO_FILE = '(no file)';
const DIVIDER_WIDTH = 60;

export function renderAnnotationsList(annotations: readonly Annotation[]): string {
  if (annotations.length === 0) return '(no annotations)';
  return annotations.map((a, i) => renderBlock(a, i + 1)).join('\n\n');
}

function renderBlock(annotation: Annotation, index: number): string {
  const conclusion = annotation.run.conclusion ?? '(no conclusion)';
  const shortSha = annotation.run.headSha.slice(0, 7);
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
    indent(annotation.message),
  ];
  if (annotation.rawDetails !== null) {
    lines.push(`  Raw details:`, indent(annotation.rawDetails));
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
