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
  readonly date: string;
  readonly runUrl: string;
  readonly runNumber: number;
}

export function renderIssueTitle(annotation: Annotation): string {
  const prefix = `[${severityLabel(annotation.severity)}]`;
  const where = annotation.path ? ` ${annotation.path}` : '';
  const head = annotation.title ?? oneLine(annotation.message);
  const trimmed = head.length > 100 ? `${head.slice(0, 97)}…` : head;
  return `${prefix}${where}: ${trimmed}`.trim();
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
          .map((o) => `- ${o.date} — [run #${o.runNumber}](${o.runUrl})`)
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
  const match = /<!--\s*annot-state:\s*({[^]*?})\s*-->/.exec(body);
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
    const m = /^-\s+(\S+)\s+—\s+\[run #(\d+)\]\((\S+)\)/.exec(line);
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
