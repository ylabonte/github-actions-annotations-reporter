import type { IssueRecord } from './types.js';

export interface WontfixConfig {
  readonly labels: readonly string[];
  readonly respectStateReason: boolean;
  readonly commentPattern: string | null;
}

export type WontfixSignal = 'label' | 'state-reason' | 'comment-pattern';

export interface WontfixDecision {
  readonly suppressed: boolean;
  readonly signal: WontfixSignal | null;
  readonly detail: string;
}

export interface DetectWontfixOptions {
  readonly issue: IssueRecord;
  readonly config: WontfixConfig;
  readonly fetchClosingComment: () => Promise<string | null>;
}

export async function detectWontfix(options: DetectWontfixOptions): Promise<WontfixDecision> {
  const { issue, config, fetchClosingComment } = options;

  if (issue.state !== 'closed') {
    return { suppressed: false, signal: null, detail: 'issue is not closed' };
  }

  const labelHit = issue.labels.find((l) => config.labels.includes(l));
  if (labelHit) {
    return {
      suppressed: true,
      signal: 'label',
      detail: `matched label "${labelHit}"`,
    };
  }

  if (config.respectStateReason && issue.stateReason === 'not_planned') {
    return {
      suppressed: true,
      signal: 'state-reason',
      detail: 'issue was closed with state_reason=not_planned',
    };
  }

  if (config.commentPattern) {
    const regex = safeCompile(config.commentPattern);
    if (regex) {
      const comment = await fetchClosingComment();
      if (comment && regex.test(comment)) {
        return {
          suppressed: true,
          signal: 'comment-pattern',
          detail: `closing comment matched /${config.commentPattern}/`,
        };
      }
    }
  }

  return { suppressed: false, signal: null, detail: 'no suppression signal matched' };
}

function safeCompile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
