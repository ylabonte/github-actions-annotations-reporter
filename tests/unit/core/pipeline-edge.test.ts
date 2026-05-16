import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../../src/core/pipeline.js';
import { parseUserConfig } from '../../../src/core/config.js';
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

describe('runPipeline — edge cases', () => {
  it('counts auto-close-hold when miss threshold is not yet met', async () => {
    const vanishedFingerprint = 'b'.repeat(64);
    const priorBody = [
      `<!-- annot-id: sha256:${vanishedFingerprint} -->`,
      `<!-- annot-state: ${JSON.stringify({
        lastSeenAt: '2026-04-01T00:00:00Z',
        missCounter: 0,
        firstSeenAt: '2026-03-01T00:00:00Z',
        workflowPath: WORKFLOW.path,
      })} -->`,
    ].join('\n');

    const issues: FakeIssue[] = [
      {
        number: 12,
        state: 'open',
        state_reason: null,
        labels: ['automation/annotation-reporter'],
        title: 'hold',
        body: priorBody,
        html_url: 'https://example/issues/12',
        closed_at: null,
        updated_at: '2026-04-01T00:00:00Z',
      },
    ];

    const { octokit, calls } = makeFakeOctokit({
      defaultBranch: 'main',
      workflows: [WORKFLOW],
      runByWorkflow: new Map([[1, RUN]]),
      jobsByRun: new Map([[11, [JOB]]]),
      annotationsByCheckRun: new Map([[200, []]]),
      issues,
      labels: new Map(),
    });

    // Config: needs ≥3 misses and ≥7 days. Only 1 miss this scan; hold expected.
    const result = await runPipeline({
      config: parseUserConfig({
        autoClose: { afterMisses: 3, afterDays: 7, requireSuccess: true, enabled: true },
      }),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });

    expect(result.summary.autoCloseHeld).toBe(1);
    expect(result.summary.autoClosed).toBe(0);
    // The hold path rewrites the state marker on the issue.
    const bodyUpdate = calls.updated.find((u) => u.body !== undefined);
    expect(bodyUpdate).toBeDefined();
    expect(bodyUpdate!.body).toContain('"missCounter":1');
  });

  it('caps writes at config.maxIssues', async () => {
    // 5 annotations, all new — but maxIssues=2.
    const annotations = Array.from({ length: 5 }, (_, i) => ({
      annotation_level: 'warning',
      message: `m${i.toString()}`,
      title: null,
      raw_details: null,
      path: `src/a${i.toString()}.ts`,
      start_line: 1,
      end_line: 1,
    }));

    const { octokit, calls } = makeFakeOctokit({
      defaultBranch: 'main',
      workflows: [WORKFLOW],
      runByWorkflow: new Map([[1, RUN]]),
      jobsByRun: new Map([[11, [JOB]]]),
      annotationsByCheckRun: new Map([[200, annotations]]),
      issues: [],
      labels: new Map(),
    });

    const result = await runPipeline({
      config: parseUserConfig({ maxIssues: 2 }),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });

    expect(calls.created).toHaveLength(2);
    expect(result.summary.newIssues).toBe(2);
    // The fingerprint dedupe in the collector keeps all 5 distinct annotations.
    expect(result.summary.totalAnnotations).toBe(5);
    // The remaining 3 create actions hit the maxIssues cap and are tallied as
    // skipped so users can see the cap fired (previously they were silently
    // dropped from the summary).
    expect(result.summary.skipped).toBe(3);
  });

  it('escalates severity labels: warning issue gets severity/error if annotation upgrades', async () => {
    const errorAnnotation = {
      annotation_level: 'failure',
      message: 'now critical',
      title: null,
      raw_details: null,
      path: 'src/foo.ts',
      start_line: 1,
      end_line: 1,
    };
    const fingerprint = computeFingerprint(WORKFLOW, {
      level: 'failure',
      message: 'now critical',
      title: null,
      rawDetails: null,
      path: 'src/foo.ts',
      startLine: 1,
      endLine: 1,
    });
    const priorBody = [
      `<!-- annot-id: sha256:${fingerprint} -->`,
      `<!-- annot-state: ${JSON.stringify({
        lastSeenAt: '2026-05-08T10:00:00Z',
        missCounter: 0,
        firstSeenAt: '2026-05-01T10:00:00Z',
        workflowPath: WORKFLOW.path,
      })} -->`,
    ].join('\n');

    const { octokit, calls } = makeFakeOctokit({
      defaultBranch: 'main',
      workflows: [WORKFLOW],
      runByWorkflow: new Map([[1, RUN]]),
      jobsByRun: new Map([[11, [JOB]]]),
      annotationsByCheckRun: new Map([[200, [errorAnnotation]]]),
      issues: [
        {
          number: 1,
          state: 'open',
          state_reason: null,
          labels: ['automation/annotation-reporter', 'severity/warning'],
          title: 'old severity',
          body: priorBody,
          html_url: 'https://example/issues/1',
          closed_at: null,
          updated_at: '2026-05-08T10:00:00Z',
        },
      ],
      labels: new Map(),
    });

    await runPipeline({
      config: parseUserConfig({}),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: true,
      now: new Date('2026-05-15T10:00:00Z'),
      octokit,
    });

    const labelUpdate = calls.updated.find((u) => u.labels?.includes('severity/error'));
    expect(labelUpdate).toBeDefined();
    expect(labelUpdate!.labels).not.toContain('severity/warning');
  });
});
