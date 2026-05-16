import type { Annotation, IssueState, Severity } from '../core/types.js';
import { blockQuote, escapeHtmlCommentBody } from '../utils/markdown.js';

const FINGERPRINT_MARKER = 'annot-id';
const STATE_MARKER = 'annot-state';
const MANAGED_BY_MARKER = 'annot-managed-by';
const MAX_OCCURRENCES = 5;

export interface RenderIssueBodyArgs {
  readonly fingerprint: string;
  readonly annotation: Annotation;
  readonly state: IssueState;
  readonly occurrences: readonly OccurrenceEntry[];
}

export interface OccurrenceEntry {
  /**
   * Single-token date string with no internal whitespace (the parser
   * captures the date via `\S+`). The canonical form is `YYYY-MM-DD`,
   * which is what the pipeline produces via `now.toISOString().slice(0,
   * 10)`. If a future caller passes a format with embedded whitespace
   * (e.g. an ISO-8601 timestamp), the renderer fails fast rather than
   * producing an entry the parser silently drops on the next round-trip.
   */
  readonly date: string;
  readonly runUrl: string;
  readonly runNumber: number;
}

/**
 * GitHub's issue-title limit is 256 characters; an API call with a longer
 * title fails the create/update with HTTP 422 and aborts the reconcile
 * pass for that fingerprint. We aim for a slightly tighter cap (`240`) so
 * any trailing punctuation (closing bracket, ellipsis) lands safely under
 * the actual limit even if a future field is added.
 */
export const MAX_TITLE_LENGTH = 240;
const HEAD_LENGTH_BUDGET = 100;

export function renderIssueTitle(annotation: Annotation): string {
  const prefix = `[${severityLabel(annotation.severity)}]`;
  const where = annotation.path ? ` ${annotation.path}` : '';
  const head = annotation.title ?? oneLine(annotation.message);
  const trimmedHead =
    head.length > HEAD_LENGTH_BUDGET ? `${head.slice(0, HEAD_LENGTH_BUDGET - 3)}…` : head;
  const assembled = `${prefix}${where}: ${trimmedHead}`.trim();
  if (assembled.length <= MAX_TITLE_LENGTH) return assembled;
  // Final assembled-title clamp — `where` (an arbitrary repo-relative path) is
  // the unbounded contributor; truncate the whole title from the right with
  // an ellipsis so the result is always API-acceptable.
  return `${assembled.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

export function renderIssueBody(args: RenderIssueBodyArgs): string {
  const { fingerprint, annotation, state, occurrences } = args;
  const stateJson = JSON.stringify({
    lastSeenAt: state.lastSeenAt,
    missCounter: state.missCounter,
    firstSeenAt: state.firstSeenAt,
    workflowPath: state.workflowPath,
  });

  const location = formatLocation(annotation);
  const escapedMessage = blockQuote(escapeHtmlCommentBody(annotation.message.trim()));
  const occurrenceList =
    occurrences.length === 0
      ? '- _(no recorded occurrences yet)_'
      : occurrences
          .slice(0, MAX_OCCURRENCES)
          .map((o) => {
            // The parser captures the date via `\S+`. Whitespace in `o.date`
            // would silently break the round-trip (the entry is rendered
            // but never re-parsed). Fail fast at the source instead.
            if (/\s/.test(o.date)) {
              throw new TypeError(
                `OccurrenceEntry.date must not contain whitespace; got ${JSON.stringify(o.date)}`,
              );
            }
            return `- ${o.date} — [run #${o.runNumber.toString()}](${o.runUrl})`;
          })
          .join('\n');

  return [
    `<!-- ${FINGERPRINT_MARKER}: sha256:${fingerprint} -->`,
    `<!-- ${MANAGED_BY_MARKER}: github-actions-annotations-reporter -->`,
    `<!-- ${STATE_MARKER}: ${stateJson} -->`,
    '',
    `**Severity:** ${annotation.severity}`,
    `**Workflow:** \`${annotation.workflow.path}\` → job \`${annotation.job.name}\``,
    location,
    '',
    escapedMessage,
    '',
    '### Recent occurrences',
    occurrenceList,
    '',
    '---',
    `*Filed by github-actions-annotations-reporter. Close with a configured "won't fix" label or "Close as not planned" to suppress future filings. Will be auto-closed once the annotation stops appearing for the configured grace period.*`,
    '',
  ].join('\n');
}

export function parseFingerprintMarker(body: string): string | null {
  const match = /<!--\s*annot-id:\s*sha256:([a-f0-9]{64})\s*-->/i.exec(body);
  if (match?.[1] == null) return null;
  return match[1].toLowerCase();
}

export function parseIssueState(body: string): IssueState | null {
  // The marker is rendered as a single line `<!-- annot-state: <json> -->`,
  // so anchor the match to a single line and capture everything between the
  // label and the trailing `-->`. This is brace-balance-agnostic — a future
  // nested-object field in the state JSON won't be truncated at its first
  // inner `}` the way a `{[^]*?}` capture would.
  const match = /^<!--\s*annot-state:\s*(.+?)\s*-->\s*$/m.exec(body);
  if (match?.[1] == null) return null;
  try {
    const obj = JSON.parse(match[1]) as Partial<IssueState>;
    if (
      typeof obj.lastSeenAt === 'string' &&
      typeof obj.missCounter === 'number' &&
      typeof obj.firstSeenAt === 'string' &&
      typeof obj.workflowPath === 'string'
    ) {
      return {
        lastSeenAt: obj.lastSeenAt,
        missCounter: obj.missCounter,
        firstSeenAt: obj.firstSeenAt,
        workflowPath: obj.workflowPath,
      };
    }
  } catch {
    // Fall through.
  }
  return null;
}

export function parseOccurrences(body: string): OccurrenceEntry[] {
  const section = body.split(/^### Recent occurrences\s*$/m)[1];
  if (!section) return [];
  const lines = section.split('\n');
  const out: OccurrenceEntry[] = [];
  for (const line of lines) {
    // Accept em-dash (U+2014, what the renderer emits), en-dash (U+2013),
    // hyphen-minus, double hyphen (--), or three hyphens (---) as the
    // date/link separator. The renderer agrees with itself today, but the
    // occurrences section is body prose — a Markdown linter, a human, or
    // an issue-templating bot can normalize punctuation, and we don't want
    // a round-trip of a managed issue to silently lose its occurrence
    // history. Whitespace around the separator is permissive.
    const m = /^-\s+(\S+)\s+(?:[—–]|-{1,3})\s+\[run #(\d+)\]\((\S+)\)/u.exec(line);
    if (m?.[1] != null && m[2] != null && m[3] != null) {
      out.push({ date: m[1], runNumber: Number.parseInt(m[2], 10), runUrl: m[3] });
    } else if (line.startsWith('---') || line.startsWith('### ')) {
      break;
    }
  }
  return out;
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function formatLocation(annotation: Annotation): string {
  if (!annotation.path) return '**File:** _not specified by the runner_';
  const line = annotation.startLine == null ? '' : ` (line ${annotation.startLine})`;
  return `**File:** \`${annotation.path}\`${line}`;
}

function oneLine(message: string): string {
  return message.replaceAll(/\s+/gu, ' ').trim();
}
