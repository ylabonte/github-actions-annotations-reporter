import { createHash } from 'node:crypto';
import type { RawAnnotation, WorkflowInfo } from './types.js';

/**
 * Stable, line-number-independent fingerprint. Refactors that shift line numbers MUST NOT
 * produce a different fingerprint — that would spawn duplicate issues across normal
 * source-file edits.
 */
export function computeFingerprint(workflow: WorkflowInfo, annotation: RawAnnotation): string {
  const preimage = [workflow.path, annotation.path, normalizeMessage(annotation.message)].join(
    '\0',
  );
  return createHash('sha256').update(preimage).digest('hex');
}

/**
 * Collapse trailing whitespace per line, strip leading/trailing blank lines, and unify line
 * endings. The goal is "same logical message → same hash" across CRLF/LF differences and
 * runner-specific whitespace.
 */
export function normalizeMessage(message: string): string {
  return message
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '');
}
