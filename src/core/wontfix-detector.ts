import type { IssueRecord } from './types.js';

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

function safeCompile(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Slice `s` to at most `max` UTF-16 code units, backing off by one if the cut
 * would land between a high and low surrogate. Prevents an unpaired surrogate
 * from leaking out of the bounded string into downstream consumers (e.g. JSON
 * serialization). The trimmed-by-one case is the only deviation from a raw
 * `.slice()` — the regex test on the bounded prefix is unaffected.
 */
function clampToCodePointBoundary(s: string, max: number): string {
  // Use `charCodeAt`, NOT `codePointAt`: when the index points at a high
  // surrogate that's part of a valid pair, `codePointAt` returns the
  // *combined* astral codepoint (e.g. 0x1F600 for 😀), bypassing the
  // surrogate-range check below. `charCodeAt` always returns the raw
  // UTF-16 code unit, so the range guard fires correctly. This is the
  // exact case the function exists to handle, so silencing the unicorn
  // rule preference here is intentional.
  // eslint-disable-next-line unicorn/prefer-code-point
  const last = s.charCodeAt(max - 1);
  const cut = last >= 0xd8_00 && last <= 0xdb_ff ? max - 1 : max;
  return s.slice(0, cut);
}
