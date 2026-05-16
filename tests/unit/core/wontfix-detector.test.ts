import { describe, expect, it, vi } from 'vitest';
import {
  detectWontfix,
  MAX_COMMENT_LENGTH,
  MAX_PATTERN_LENGTH,
} from '../../../src/core/wontfix-detector.js';
import { makeIssue } from '../../helpers/fixtures.js';

const baseConfig = {
  labels: ['wontfix', 'accepted-noise'],
  respectStateReason: true,
  commentPattern: null,
};

describe('detectWontfix', () => {
  it('does not suppress open issues', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'open' }),
      config: baseConfig,
      fetchClosingComment: vi.fn(),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('suppresses when a closed issue carries a configured label', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({
        state: 'closed',
        labels: ['wontfix'],
      }),
      config: baseConfig,
      fetchClosingComment: vi.fn(),
    });
    expect(decision.suppressed).toBe(true);
    expect(decision.signal).toBe('label');
  });

  it('suppresses when closed with state_reason=not_planned and respectStateReason=true', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed', stateReason: 'not_planned' }),
      config: baseConfig,
      fetchClosingComment: vi.fn(),
    });
    expect(decision.suppressed).toBe(true);
    expect(decision.signal).toBe('state-reason');
  });

  it('does NOT suppress on state_reason=not_planned when respectStateReason=false', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed', stateReason: 'not_planned' }),
      config: { ...baseConfig, respectStateReason: false },
      fetchClosingComment: vi.fn(),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('suppresses when the closing comment matches the configured regex', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: 'won.?fix|accept' },
      fetchClosingComment: vi.fn().mockResolvedValue('I accept this — close.'),
    });
    expect(decision.suppressed).toBe(true);
    expect(decision.signal).toBe('comment-pattern');
  });

  it('does not suppress on a non-matching closing comment', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: 'won.?fix' },
      fetchClosingComment: vi.fn().mockResolvedValue('actually addressed in PR #99'),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('treats an invalid regex as a non-match (fail-safe)', async () => {
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: '[' }, // invalid
      fetchClosingComment: vi.fn().mockResolvedValue('anything'),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('rejects oversized regex patterns (ReDoS guard)', async () => {
    const oversizedPattern = 'a'.repeat(MAX_PATTERN_LENGTH + 1);
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: oversizedPattern },
      fetchClosingComment: vi.fn().mockResolvedValue('anything'),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('caps the tested comment length when matching the user regex', async () => {
    // Tail-only match: needle is past the cap → should NOT match because
    // the tested string is truncated to MAX_COMMENT_LENGTH.
    const noise = 'x'.repeat(MAX_COMMENT_LENGTH);
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: 'wontfix' },
      fetchClosingComment: vi.fn().mockResolvedValue(`${noise} wontfix`),
    });
    expect(decision.suppressed).toBe(false);
  });

  it('still matches when the needle is within the cap', async () => {
    // Needle near the start; padding extends well past the cap but matching
    // succeeds because the prefix is preserved.
    const padding = 'x'.repeat(MAX_COMMENT_LENGTH + 1000);
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: 'wontfix' },
      fetchClosingComment: vi.fn().mockResolvedValue(`wontfix ${padding}`),
    });
    expect(decision.suppressed).toBe(true);
    expect(decision.signal).toBe('comment-pattern');
  });

  it('clamps on a code-point boundary (surrogate pair straddling the cap)', async () => {
    // Build a comment where the cap falls exactly on the high surrogate
    // of an emoji pair. Use a behavior-based assertion: a pattern that
    // matches "the last char is an 'a'" succeeds only if the clamp
    // correctly trims the dangling high surrogate, leaving the trailing
    // 'a' from the padding intact.
    //
    // If the implementation regresses and uses `codePointAt` instead of
    // `charCodeAt` (so the surrogate-range guard misses), the bounded
    // string ends with U+D83D and the `a$` test fails.
    const padding = 'a'.repeat(MAX_COMMENT_LENGTH - 1);
    const comment = `${padding}\u{1F600}tail`;
    const decision = await detectWontfix({
      issue: makeIssue({ state: 'closed' }),
      config: { ...baseConfig, commentPattern: 'a$' },
      fetchClosingComment: () => Promise.resolve(comment),
    });
    expect(decision.suppressed).toBe(true);
    expect(decision.signal).toBe('comment-pattern');
  });
});
