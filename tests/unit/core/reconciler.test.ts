import { describe, expect, it, vi } from 'vitest';
import { reconcile } from '../../../src/core/reconciler.js';
import { makeAnnotation, makeIssue, makeIssueState, makeRun } from '../../helpers/fixtures.js';

const WONTFIX = { labels: ['wontfix'], respectStateReason: true, commentPattern: null };
const AUTO_CLOSE_OFF = { enabled: false, afterDays: 7, afterMisses: 3, requireSuccess: true };
const AUTO_CLOSE_AGGRESSIVE = {
  enabled: true,
  afterDays: 0,
  afterMisses: 1,
  requireSuccess: true,
};
const NOW = new Date(Date.UTC(2026, 4, 15));

describe('reconcile — annotation × prior-issue matrix', () => {
  it('emits create when there is no prior issue', async () => {
    const ann = makeAnnotation();
    const result = await reconcile({
      annotations: [ann],
      priorIssues: [],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_OFF,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set([ann.workflow.path]),
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.kind).toBe('create');
  });

  it('emits update when there is an open prior issue', async () => {
    const ann = makeAnnotation();
    const prior = makeIssue({ fingerprint: ann.fingerprint, state: 'open' });
    const result = await reconcile({
      annotations: [ann],
      priorIssues: [prior],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_OFF,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set([ann.workflow.path]),
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions[0]!.kind).toBe('update');
    expect(result.actions[0]!.issueNumber).toBe(prior.number);
  });

  it('emits suppressed when prior issue is closed with a wontfix label', async () => {
    const ann = makeAnnotation();
    const prior = makeIssue({
      fingerprint: ann.fingerprint,
      state: 'closed',
      labels: ['wontfix'],
    });
    const result = await reconcile({
      annotations: [ann],
      priorIssues: [prior],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_OFF,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set([ann.workflow.path]),
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions[0]!.kind).toBe('suppressed');
  });

  it('emits reopen when prior issue is closed without a suppression signal', async () => {
    const ann = makeAnnotation();
    const prior = makeIssue({
      fingerprint: ann.fingerprint,
      state: 'closed',
      stateReason: 'completed',
      labels: [],
    });
    const result = await reconcile({
      annotations: [ann],
      priorIssues: [prior],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_OFF,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set([ann.workflow.path]),
      now: NOW,
      fetchClosingComment: vi.fn().mockResolvedValue(null),
    });
    expect(result.actions[0]!.kind).toBe('reopen');
  });
});

describe('reconcile — vanish pass', () => {
  it('emits auto-close-hold for vanished issues below threshold', async () => {
    const issue = makeIssue({
      fingerprint: 'abc123',
      state: 'open',
      parsedState: makeIssueState({
        missCounter: 0,
        lastSeenAt: new Date(Date.UTC(2026, 4, 10)).toISOString(),
      }),
    });
    const result = await reconcile({
      annotations: [],
      priorIssues: [issue],
      wontfix: WONTFIX,
      autoClose: { enabled: true, afterDays: 30, afterMisses: 3, requireSuccess: true },
      latestRunByWorkflowPath: new Map([[issue.parsedState!.workflowPath, makeRun()]]),
      scannedWorkflowPaths: new Set([issue.parsedState!.workflowPath]),
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions[0]!.kind).toBe('auto-close-hold');
  });

  it('emits auto-close when thresholds are met and the workflow succeeded', async () => {
    const issue = makeIssue({
      fingerprint: 'abc123',
      state: 'open',
      parsedState: makeIssueState({
        missCounter: 3,
        lastSeenAt: new Date(Date.UTC(2026, 4, 1)).toISOString(),
      }),
    });
    const result = await reconcile({
      annotations: [],
      priorIssues: [issue],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_AGGRESSIVE,
      latestRunByWorkflowPath: new Map([[issue.parsedState!.workflowPath, makeRun()]]),
      scannedWorkflowPaths: new Set([issue.parsedState!.workflowPath]),
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions[0]!.kind).toBe('auto-close');
  });

  it('does not auto-close when the workflow is outside scan scope', async () => {
    const issue = makeIssue({
      fingerprint: 'abc123',
      state: 'open',
      parsedState: makeIssueState({
        missCounter: 3,
        lastSeenAt: new Date(Date.UTC(2026, 4, 1)).toISOString(),
      }),
    });
    const result = await reconcile({
      annotations: [],
      priorIssues: [issue],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_AGGRESSIVE,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set(), // empty: workflow not scanned
      now: NOW,
      fetchClosingComment: vi.fn(),
    });
    expect(result.actions).toHaveLength(0);
  });

  it('reopens a previously auto-closed issue when the annotation returns', async () => {
    const ann = makeAnnotation();
    const prior = makeIssue({
      fingerprint: ann.fingerprint,
      state: 'closed',
      stateReason: 'completed',
      labels: [],
    });
    const result = await reconcile({
      annotations: [ann],
      priorIssues: [prior],
      wontfix: WONTFIX,
      autoClose: AUTO_CLOSE_AGGRESSIVE,
      latestRunByWorkflowPath: new Map(),
      scannedWorkflowPaths: new Set([ann.workflow.path]),
      now: NOW,
      fetchClosingComment: vi.fn().mockResolvedValue(null),
    });
    expect(result.actions.find((a) => a.kind === 'reopen')).toBeTruthy();
  });
});
