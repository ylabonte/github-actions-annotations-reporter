import { describe, expect, it } from 'vitest';
import {
  addIssueComment,
  createIssue,
  ensureLabel,
  getClosingComment,
  listManagedIssues,
  updateIssue,
} from '../../../../src/core/github/issues.js';
import { makeFakeOctokit, type FakeIssue } from '../../../helpers/fake-octokit.js';
import { REPO } from '../../../helpers/fixtures.js';

function emptyState() {
  return {
    workflows: [],
    runByWorkflow: new Map(),
    jobsByRun: new Map(),
    annotationsByCheckRun: new Map(),
    issues: [] as FakeIssue[],
    labels: new Map<string, { name: string; color: string; description: string }>(),
  };
}

describe('ensureLabel', () => {
  it('creates the label when it does not exist', async () => {
    const { octokit, calls } = makeFakeOctokit(emptyState());
    await ensureLabel(octokit, REPO, 'severity/notice', 'aabbcc', 'desc');
    expect(calls.labelsCreated).toEqual([{ name: 'severity/notice', color: 'aabbcc' }]);
  });

  it('is a no-op when the label already exists', async () => {
    const state = emptyState();
    state.labels.set('existing', { name: 'existing', color: '000000', description: '' });
    const { octokit, calls } = makeFakeOctokit(state);
    await ensureLabel(octokit, REPO, 'existing', 'ffffff', 'd');
    expect(calls.labelsCreated).toHaveLength(0);
  });

  it('rethrows non-404 errors from getLabel', async () => {
    const octokit = {
      issues: {
        getLabel: () => {
          const err = new Error('bad') as Error & { status: number };
          err.status = 500;
          throw err;
        },
        createLabel: () => Promise.resolve({ data: {} }),
      },
    } as unknown as Parameters<typeof ensureLabel>[0];
    await expect(ensureLabel(octokit, REPO, 'x', 'aa', 'd')).rejects.toThrow(/bad/);
  });
});

describe('listManagedIssues', () => {
  it('parses fingerprint marker and state JSON from each body', async () => {
    const state = emptyState();
    state.issues = [
      {
        number: 1,
        state: 'open',
        state_reason: null,
        labels: ['automation/annotation-reporter'],
        title: 't',
        body: `<!-- annot-id: sha256:${'a'.repeat(64)} -->\n<!-- annot-state: ${JSON.stringify({ lastSeenAt: 'x', missCounter: 1, firstSeenAt: 'y', workflowPath: 'p' })} -->`,
        html_url: 'u',
        closed_at: null,
        updated_at: '2026-05-15T10:00:00Z',
      },
    ];
    const { octokit } = makeFakeOctokit(state);
    const records = await listManagedIssues(octokit, REPO, 'automation/annotation-reporter');
    expect(records).toHaveLength(1);
    expect(records[0]!.fingerprint).toBe('a'.repeat(64));
    expect(records[0]!.parsedState?.missCounter).toBe(1);
  });

  it('filters out PRs masquerading as issues', async () => {
    const state = emptyState();
    state.issues = [
      {
        number: 2,
        state: 'open',
        state_reason: null,
        labels: [],
        title: 'pr',
        body: '',
        html_url: 'u',
        closed_at: null,
        updated_at: '',
      },
    ];
    (state.issues[0] as FakeIssue & { pull_request?: unknown }).pull_request = { url: 'x' };
    const { octokit } = makeFakeOctokit(state);
    const records = await listManagedIssues(octokit, REPO, 'automation/annotation-reporter');
    expect(records).toHaveLength(0);
  });

  it('iterates across multiple pages (per_page=100, more than one page of data)', async () => {
    // Production code passes `per_page: 100` and relies on
    // `octokit.paginate.iterator` to walk every page. Seed > 100 issues
    // so the iterator has to yield multiple pages; assert every record
    // surfaces in the final result.
    const state = emptyState();
    state.issues = Array.from({ length: 250 }, (_, i) => ({
      number: i + 1,
      state: 'open' as const,
      state_reason: null,
      labels: ['automation/annotation-reporter'],
      title: `issue #${(i + 1).toString()}`,
      body: '',
      html_url: '',
      closed_at: null,
      updated_at: '',
    }));
    const { octokit } = makeFakeOctokit(state);
    const records = await listManagedIssues(octokit, REPO, 'automation/annotation-reporter');
    expect(records).toHaveLength(250);
    // Sanity: every page contributed (first, mid, last).
    expect(records[0]!.number).toBe(1);
    expect(records[99]!.number).toBe(100);
    expect(records[100]!.number).toBe(101);
    expect(records[249]!.number).toBe(250);
  });
});

describe('createIssue / updateIssue / addIssueComment', () => {
  it('round-trips through the fake octokit', async () => {
    const { octokit, calls } = makeFakeOctokit(emptyState());
    const { number } = await createIssue(octokit, REPO, {
      title: 'hi',
      body: 'body',
      labels: ['a'],
    });
    await updateIssue(octokit, REPO, {
      issueNumber: number,
      body: 'updated',
      state: 'closed',
      stateReason: 'completed',
      labels: ['b'],
    });
    await addIssueComment(octokit, REPO, number, 'comment');
    expect(calls.created).toHaveLength(1);
    expect(calls.updated[0]!.state).toBe('closed');
    expect(calls.updated[0]!.stateReason).toBe('completed');
    expect(calls.comments[0]!.body).toBe('comment');
  });
});

describe('getClosingComment', () => {
  it('returns null when the issue has no closed_at', async () => {
    const state = emptyState();
    state.issues = [
      {
        number: 5,
        state: 'open',
        state_reason: null,
        labels: [],
        title: 'open',
        body: '',
        html_url: '',
        closed_at: null,
        updated_at: '',
      },
    ];
    const { octokit } = makeFakeOctokit(state);
    expect(await getClosingComment(octokit, REPO, 5)).toBeNull();
  });

  it('returns the last comment by the closer authored at-or-before closed_at', async () => {
    const state = emptyState();
    state.issues = [
      {
        number: 6,
        state: 'closed',
        state_reason: 'not_planned',
        labels: [],
        title: 't',
        body: '',
        html_url: '',
        closed_at: '2026-05-10T12:00:00Z',
        updated_at: '2026-05-10T12:00:00Z',
        closed_by: { login: 'alice' },
        comments: [
          { user: { login: 'alice' }, created_at: '2026-05-10T11:00:00Z', body: 'wontfix' },
          { user: { login: 'bob' }, created_at: '2026-05-10T11:30:00Z', body: 'unrelated' },
          { user: { login: 'alice' }, created_at: '2026-05-10T11:45:00Z', body: 'final word' },
          { user: { login: 'alice' }, created_at: '2026-05-10T13:00:00Z', body: 'after close' },
        ],
      },
    ];
    const { octokit } = makeFakeOctokit(state);
    expect(await getClosingComment(octokit, REPO, 6)).toBe('final word');
  });

  it('fails closed (returns null) when closed_by is unknown (security: no attacker-planted comment match)', async () => {
    // Before: any comment ≤ closed_at was accepted as the closing voice when
    // closed_by was missing — letting an unrelated actor's comment satisfy a
    // wontfix-comment-pattern check on a deleted-actor / App-closed issue.
    // After: null closer → no closing-comment match, no suppression.
    const state = emptyState();
    state.issues = [
      {
        number: 7,
        state: 'closed',
        state_reason: 'not_planned',
        labels: [],
        title: 't',
        body: '',
        html_url: '',
        closed_at: '2026-05-10T12:00:00Z',
        updated_at: '',
        comments: [
          { user: { login: 'anyone' }, created_at: '2026-05-10T11:00:00Z', body: 'noise' },
        ],
      },
    ];
    const { octokit } = makeFakeOctokit(state);
    expect(await getClosingComment(octokit, REPO, 7)).toBeNull();
  });
});
