import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '../../../src/core/pipeline.js';
import { ConfigSchema, parseUserConfig } from '../../../src/core/config.js';
import { makeFakeOctokit, type FakeIssue } from '../../helpers/fake-octokit.js';
import { REPO } from '../../helpers/fixtures.js';
import { computeFingerprint } from '../../../src/core/fingerprint.js';

const WORKFLOW = { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' };
const RUN = {
  id: 11,
  run_number: 42,
  html_url: 'r/42',
  head_branch: 'main',
  head_sha: 'abc',
  conclusion: 'success',
  created_at: '2026-05-15T10:00:00Z',
};
const JOB = { id: 100, name: 'lint', check_run_url: '/check-runs/200' };
const ANNOTATION = {
  annotation_level: 'warning',
  message: 'deprecated API',
  title: null,
  raw_details: null,
  path: 'src/foo.ts',
  start_line: 42,
  end_line: 42,
};

const FINGERPRINT = computeFingerprint(
  { ...WORKFLOW },
  {
    level: 'warning',
    message: ANNOTATION.message,
    title: null,
    rawDetails: null,
    path: ANNOTATION.path,
    startLine: ANNOTATION.start_line,
    endLine: ANNOTATION.end_line,
  },
);

function freshState(issues: FakeIssue[] = []) {
  return {
    defaultBranch: 'main',
    workflows: [WORKFLOW],
    runByWorkflow: new Map([[1, RUN]]),
    jobsByRun: new Map([[11, [JOB]]]),
    annotationsByCheckRun: new Map([[200, [ANNOTATION]]]),
    issues,
    labels: new Map<string, { name: string; color: string; description: string }>(),
  };
}

describe('runPipeline — create / update / auto-close', () => {
  it('creates a new issue when no prior exists', async () => {
    const { octokit, calls } = makeFakeOctokit(freshState());
    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });
    expect(result.summary.newIssues).toBe(1);
    expect(calls.created).toHaveLength(1);
    expect(calls.labelsCreated.length).toBeGreaterThan(0);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]!.fingerprint).toBe(FINGERPRINT);
    expect(result.annotations[0]!.severity).toBe('warning');
  });

  it('updates an existing open issue', async () => {
    const priorBody = [
      `<!-- annot-id: sha256:${FINGERPRINT} -->`,
      '<!-- annot-managed-by: github-actions-annotations-reporter -->',
      `<!-- annot-state: ${JSON.stringify({
        lastSeenAt: '2026-05-08T10:00:00Z',
        missCounter: 0,
        firstSeenAt: '2026-05-01T10:00:00Z',
        workflowPath: WORKFLOW.path,
      })} -->`,
      '',
      '### Recent occurrences',
      '- 2026-05-08 — [run #1](https://example/r/1)',
    ].join('\n');
    const { octokit, calls } = makeFakeOctokit(
      freshState([
        {
          number: 7,
          state: 'open',
          state_reason: null,
          labels: ['automation/annotation-reporter', 'severity/warning'],
          title: 'old',
          body: priorBody,
          html_url: 'https://example/issues/7',
          closed_at: null,
          updated_at: '2026-05-08T10:00:00Z',
        },
      ]),
    );
    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });
    expect(result.summary.updatedIssues).toBe(1);
    expect(calls.updated).toHaveLength(1);
    expect(calls.created).toHaveLength(0);
  });

  it('respects wontfix label suppression on closed prior issues', async () => {
    const { octokit, calls } = makeFakeOctokit(
      freshState([
        {
          number: 9,
          state: 'closed',
          state_reason: 'not_planned',
          labels: ['automation/annotation-reporter', 'wontfix'],
          title: 'wontfix',
          body: `<!-- annot-id: sha256:${FINGERPRINT} -->`,
          html_url: 'https://example/issues/9',
          closed_at: '2026-05-10T10:00:00Z',
          updated_at: '2026-05-10T10:00:00Z',
        },
      ]),
    );
    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });
    expect(result.summary.suppressed).toBe(1);
    expect(calls.created).toHaveLength(0);
  });

  it('auto-closes managed open issues whose annotation has vanished', async () => {
    const vanishedFingerprint = 'f'.repeat(64);
    const priorBody = [
      `<!-- annot-id: sha256:${vanishedFingerprint} -->`,
      `<!-- annot-state: ${JSON.stringify({
        lastSeenAt: '2026-04-01T00:00:00Z',
        missCounter: 5,
        firstSeenAt: '2026-03-01T00:00:00Z',
        workflowPath: WORKFLOW.path,
      })} -->`,
    ].join('\n');
    const state = freshState([]);
    state.annotationsByCheckRun = new Map([[200, []]]);
    const { octokit, calls } = makeFakeOctokit({
      ...state,
      issues: [
        {
          number: 12,
          state: 'open',
          state_reason: null,
          labels: ['automation/annotation-reporter'],
          title: 'vanished',
          body: priorBody,
          html_url: 'https://example/issues/12',
          closed_at: null,
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
    });

    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });

    expect(result.summary.autoClosed).toBe(1);
    expect(calls.comments).toHaveLength(1);
    expect(calls.updated.find((u) => u.state === 'closed')).toBeTruthy();
  });

  it('reopens a closed-not-wontfix issue when the annotation returns', async () => {
    const { octokit, calls } = makeFakeOctokit(
      freshState([
        {
          number: 33,
          state: 'closed',
          state_reason: 'completed',
          labels: ['automation/annotation-reporter'],
          title: 'previously auto-closed',
          body: `<!-- annot-id: sha256:${FINGERPRINT} -->`,
          html_url: 'https://example/issues/33',
          closed_at: '2026-05-10T10:00:00Z',
          updated_at: '2026-05-10T10:00:00Z',
          closed_by: { login: 'github-actions[bot]' },
          comments: [
            {
              user: { login: 'github-actions[bot]' },
              created_at: '2026-05-10T09:59:00Z',
              body: 'Auto-closed.',
            },
          ],
        },
      ]),
    );
    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });
    expect(result.summary.reopenedIssues).toBe(1);
    expect(calls.updated.find((u) => u.state === 'open')).toBeTruthy();
  });

  it('dry-run mode tallies actions without applying writes', async () => {
    const { octokit, calls } = makeFakeOctokit(freshState());
    const result = await runPipeline({
      config: ConfigSchema.parse(parseUserConfig({})),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: true,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });
    expect(result.summary.newIssues).toBe(1);
    expect(calls.created).toHaveLength(0);
    expect(calls.updated).toHaveLength(0);
  });

  it('throws when the repository cannot be determined', async () => {
    // GitHub Actions runners auto-set GITHUB_REPOSITORY, which would let
    // resolveRepoFromEnv() succeed and short-circuit the throw. Clear it
    // (and GH_TOKEN / GITHUB_TOKEN, which the auth chain would otherwise
    // read) so the test exercises the "no repo" branch on every host.
    // Inject a no-op `runGit` so the dev's local .git/origin doesn't either.
    vi.stubEnv('GITHUB_REPOSITORY', '');
    vi.stubEnv('GH_TOKEN', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    try {
      const { octokit } = makeFakeOctokit(freshState());
      await expect(
        runPipeline({
          config: ConfigSchema.parse(parseUserConfig({})),
          explicitToken: 'tok',
          dryRun: false,
          applyMode: true,
          now: new Date('2026-05-15T10:00:00Z'),
          octokit,
          runGit: () => Promise.resolve(null),
        }),
      ).rejects.toThrow(/repository/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
