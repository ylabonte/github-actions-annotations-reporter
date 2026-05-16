import { describe, expect, it } from 'vitest';
import { evaluateAutoClose, renderAutoCloseComment } from '../../../src/core/auto-close-policy.js';
import { makeIssue, makeIssueState, makeRun } from '../../helpers/fixtures.js';

const fullConfig = { enabled: true, afterDays: 7, afterMisses: 3, requireSuccess: true };

function daysAgo(days: number): string {
  return new Date(Date.UTC(2026, 4, 15) - days * 86_400_000).toISOString();
}

const NOW = new Date(Date.UTC(2026, 4, 15));

describe('evaluateAutoClose', () => {
  it('skips when disabled', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue(),
      config: { ...fullConfig, enabled: false },
      workflowLatestRun: makeRun(),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('skip');
  });

  it('skips closed issues', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({ state: 'closed' }),
      config: fullConfig,
      workflowLatestRun: makeRun(),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('skip');
  });

  it('skips when source workflow is outside scope', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue(),
      config: fullConfig,
      workflowLatestRun: makeRun(),
      workflowInScope: false,
      now: NOW,
    });
    expect(decision.kind).toBe('skip');
  });

  it('skips when requireSuccess and run failed', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue(),
      config: fullConfig,
      workflowLatestRun: makeRun({ conclusion: 'failure' }),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('skip');
  });

  it('skips when requireSuccess and no run available', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue(),
      config: fullConfig,
      workflowLatestRun: null,
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('skip');
  });

  it('holds when below miss threshold', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({
        parsedState: makeIssueState({ missCounter: 0, lastSeenAt: daysAgo(10) }),
      }),
      config: fullConfig,
      workflowLatestRun: makeRun(),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('hold');
    if (decision.kind === 'hold') expect(decision.newMissCounter).toBe(1);
  });

  it('holds when above misses but below age threshold', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({
        parsedState: makeIssueState({ missCounter: 3, lastSeenAt: daysAgo(2) }),
      }),
      config: fullConfig,
      workflowLatestRun: makeRun(),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('hold');
  });

  it('closes when both miss threshold and age threshold are met', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({
        parsedState: makeIssueState({ missCounter: 2, lastSeenAt: daysAgo(8) }),
      }),
      config: fullConfig,
      workflowLatestRun: makeRun({ conclusion: 'success' }),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('close');
    if (decision.kind === 'close') expect(decision.newMissCounter).toBe(3);
  });

  it('allows auto-close on failed runs when requireSuccess=false', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({
        parsedState: makeIssueState({ missCounter: 5, lastSeenAt: daysAgo(30) }),
      }),
      config: { ...fullConfig, requireSuccess: false },
      workflowLatestRun: makeRun({ conclusion: 'failure' }),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('close');
  });

  it('treats missing parsedState as infinitely old (eligible by age)', () => {
    const decision = evaluateAutoClose({
      issue: makeIssue({ parsedState: null }),
      config: { ...fullConfig, afterMisses: 1 },
      workflowLatestRun: makeRun(),
      workflowInScope: true,
      now: NOW,
    });
    expect(decision.kind).toBe('close');
  });
});

describe('renderAutoCloseComment', () => {
  it('includes the last-seen date and miss counter', () => {
    const comment = renderAutoCloseComment({
      missCounter: 5,
      lastSeenAt: '2026-05-01T00:00:00.000Z',
    });
    expect(comment).toContain('2026-05-01T00:00:00.000Z');
    expect(comment).toContain('5 consecutive scans');
  });

  it('handles a null last-seen gracefully', () => {
    const comment = renderAutoCloseComment({ missCounter: 1, lastSeenAt: null });
    expect(comment).toContain('(unknown)');
  });
});
