import type { IssueRecord } from './types.js';
import { clampToCodePointBoundary } from '../utils/clamp-code-point.js';

/**
 * Caps on user-supplied regex inputs. Both surfaces are reachable from
 * untrusted config: a pathological pattern combined with a crafted closing
 * comment could trigger catastrophic backtracking. The pattern cap rejects
 * absurdly long patterns outright; the comment cap bounds the test input so
 * even a poorly-written user pattern can't exceed roughly linear work in the
 * size of the cap.
 */
export const MAX_PATTERN_LENGTH = 1000;
export const MAX_COMMENT_LENGTH = 64 * 1024;

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
      // Cap the tested string length to bound regex evaluation cost on long
      // attacker-controlled comments. A wontfix marker would land near the
      // top of any reasonable comment anyway, so truncation rarely loses a
      // real signal.
      const bounded =
        comment != null && comment.length > MAX_COMMENT_LENGTH
          ? clampToCodePointBoundary(comment, MAX_COMMENT_LENGTH)
          : comment;
      if (bounded && regex.test(bounded)) {
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

/**
 * Translate a leading PCRE/Perl-style `(?<flags>)` group at the start of
 * a pattern into JavaScript `RegExp` flags. JS does not accept this inline
 * syntax (it's a SyntaxError), but users coming from grep/Perl/Ruby/Python
 * write it intuitively. Supports any combination of `imsuy`; everything
 * after the closing `)` becomes the pattern body.
 *
 * Examples:
 *   `(?i)wontfix` → /wontfix/i
 *   `(?im)^x$`   → /^x$/im
 *   `^x$`        → /^x$/   (unchanged)
 */
function parseInlineFlags(pattern: string): { body: string; flags: string } {
  const m = /^\(\?([imsuy]+)\)/.exec(pattern);
  if (m?.[1] === undefined) return { body: pattern, flags: '' };
  // Deduplicate the flag chars while preserving order. `match` returns a
  // string of ASCII flag chars (`imsuy`), so iterating via `for-of` is
  // safe (each codepoint is a single code unit).
  const seen = new Set<string>();
  for (const ch of m[1]) seen.add(ch);
  return { body: pattern.slice(m[0].length), flags: [...seen].join('') };
}

function safeCompile(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  const { body, flags } = parseInlineFlags(pattern);
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}
