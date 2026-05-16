import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../../src/core/pipeline.js';
import { parseUserConfig } from '../../../src/core/config.js';
import { makeFakeOctokit } from '../../helpers/fake-octokit.js';
import { REPO } from '../../helpers/fixtures.js';

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
  message: 'm',
  title: null,
  raw_details: null,
  path: 'p',
  start_line: 1,
  end_line: 1,
};

describe('runPipeline — scan mode (applyMode=false)', () => {
  it('reports actions without performing writes', async () => {
    const { octokit, calls } = makeFakeOctokit({
      workflows: [WORKFLOW],
      runByWorkflow: new Map([[1, RUN]]),
      jobsByRun: new Map([[11, [JOB]]]),
      annotationsByCheckRun: new Map([[200, [ANNOTATION]]]),
      issues: [],
      labels: new Map(),
    });

    const result = await runPipeline({
      config: parseUserConfig({}),
      explicitToken: 'tok',
      explicitRepo: REPO,
      dryRun: false,
      applyMode: false,
      octokit,
    });

    expect(result.summary.newIssues).toBe(1);
    expect(calls.created).toHaveLength(0);
    expect(calls.labelsCreated).toHaveLength(0);
  });
});
