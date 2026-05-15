import { describe, expect, it } from 'vitest';
import { collectAnnotations } from '../../../src/core/annotation-collector.js';
import type { OctokitInstance } from '../../../src/core/github/client.js';
import { REPO } from '../../helpers/fixtures.js';

interface MockedWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface MockedJob {
  id: number;
  name: string;
  check_run_url: string;
}

interface MockedAnnotation {
  annotation_level: string;
  message: string;
  title: string | null;
  raw_details: string | null;
  path: string;
  start_line: number | null;
  end_line: number | null;
}

interface OctokitMockArgs {
  workflows: readonly MockedWorkflow[];
  runByWorkflow: Map<number, MockedRun | null>;
  jobsByRun: Map<number, readonly MockedJob[]>;
  annotationsByCheckRun: Map<number, readonly MockedAnnotation[]>;
}

interface MockedRun {
  id: number;
  run_number: number;
  html_url: string;
  head_branch: string;
  head_sha: string;
  conclusion: string;
  created_at: string;
}

function makeOctokit(args: OctokitMockArgs): OctokitInstance {
  const listRepoWorkflows = (_p: unknown) => Promise.resolve({ data: args.workflows });
  const listJobsForWorkflowRun = (p: { run_id: number }) =>
    Promise.resolve({ data: args.jobsByRun.get(p.run_id) ?? [] });
  const listAnnotations = (p: { check_run_id: number }) =>
    Promise.resolve({ data: args.annotationsByCheckRun.get(p.check_run_id) ?? [] });
  const listWorkflowRuns = (p: { workflow_id: number }) => {
    const run = args.runByWorkflow.get(p.workflow_id);
    return Promise.resolve({ data: { workflow_runs: run ? [run] : [] } });
  };

  return {
    paginate: {
      async *iterator(method: (p: unknown) => Promise<{ data: unknown[] }>, params: unknown) {
        const { data } = await method(params);
        yield { data };
      },
    },
    actions: {
      listRepoWorkflows,
      listJobsForWorkflowRun,
      listWorkflowRuns,
    },
    checks: { listAnnotations },
  } as unknown as OctokitInstance;
}

describe('collectAnnotations', () => {
  it('walks workflows → runs → jobs → annotations and dedupes', async () => {
    const octokit = makeOctokit({
      workflows: [
        { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
        { id: 2, name: 'Release', path: '.github/workflows/release.yml', state: 'active' },
      ],
      runByWorkflow: new Map([
        [
          1,
          {
            id: 11,
            run_number: 1,
            html_url: 'r/1',
            head_branch: 'main',
            head_sha: 'a',
            conclusion: 'success',
            created_at: '2026-05-15T10:00:00Z',
          },
        ],
        [
          2,
          {
            id: 22,
            run_number: 2,
            html_url: 'r/2',
            head_branch: 'main',
            head_sha: 'b',
            conclusion: 'success',
            created_at: '2026-05-15T10:00:00Z',
          },
        ],
      ]),
      jobsByRun: new Map([
        [11, [{ id: 111, name: 'lint', check_run_url: '/check-runs/1001' }]],
        [22, [{ id: 222, name: 'publish', check_run_url: '/check-runs/2002' }]],
      ]),
      annotationsByCheckRun: new Map([
        [
          1001,
          [
            {
              annotation_level: 'warning',
              message: 'dup',
              title: null,
              raw_details: null,
              path: 'src/a.ts',
              start_line: 1,
              end_line: 1,
            },
            {
              annotation_level: 'warning',
              message: 'dup',
              title: null,
              raw_details: null,
              path: 'src/a.ts',
              start_line: 10,
              end_line: 10,
            },
          ],
        ],
        [
          2002,
          [
            {
              annotation_level: 'failure',
              message: 'release issue',
              title: null,
              raw_details: null,
              path: 'pkg.json',
              start_line: null,
              end_line: null,
            },
          ],
        ],
      ]),
    });

    const result = await collectAnnotations(octokit, {
      ref: REPO,
      branch: 'main',
      filter: { include: [], exclude: [] },
      minSeverity: 'notice',
    });

    expect(result.annotations).toHaveLength(2);
    expect(result.scannedWorkflowPaths.size).toBe(2);
    const releaseAnnotation = result.annotations.find((a) => a.workflow.id === 2);
    expect(releaseAnnotation?.severity).toBe('error');
  });

  it('skips workflows that fail the filter', async () => {
    const octokit = makeOctokit({
      workflows: [
        { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
        { id: 2, name: 'Release', path: '.github/workflows/release.yml', state: 'active' },
      ],
      runByWorkflow: new Map(),
      jobsByRun: new Map(),
      annotationsByCheckRun: new Map(),
    });

    const result = await collectAnnotations(octokit, {
      ref: REPO,
      branch: 'main',
      filter: { include: ['CI'], exclude: [] },
      minSeverity: 'notice',
    });

    expect(result.scannedWorkflowPaths.has('.github/workflows/ci.yml')).toBe(true);
    expect(result.scannedWorkflowPaths.has('.github/workflows/release.yml')).toBe(false);
  });

  it('drops annotations below minSeverity', async () => {
    const octokit = makeOctokit({
      workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' }],
      runByWorkflow: new Map([
        [
          1,
          {
            id: 11,
            run_number: 1,
            html_url: 'r/1',
            head_branch: 'main',
            head_sha: 'a',
            conclusion: 'success',
            created_at: '2026-05-15T10:00:00Z',
          },
        ],
      ]),
      jobsByRun: new Map([[11, [{ id: 111, name: 'lint', check_run_url: '/check-runs/1001' }]]]),
      annotationsByCheckRun: new Map([
        [
          1001,
          [
            {
              annotation_level: 'notice',
              message: 'low',
              title: null,
              raw_details: null,
              path: 'a.ts',
              start_line: null,
              end_line: null,
            },
            {
              annotation_level: 'failure',
              message: 'high',
              title: null,
              raw_details: null,
              path: 'a.ts',
              start_line: null,
              end_line: null,
            },
          ],
        ],
      ]),
    });

    const result = await collectAnnotations(octokit, {
      ref: REPO,
      branch: 'main',
      filter: { include: [], exclude: [] },
      minSeverity: 'warning',
    });

    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]!.severity).toBe('error');
  });

  it('handles workflows with no completed run gracefully', async () => {
    const octokit = makeOctokit({
      workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' }],
      runByWorkflow: new Map([[1, null]]),
      jobsByRun: new Map(),
      annotationsByCheckRun: new Map(),
    });
    const result = await collectAnnotations(octokit, {
      ref: REPO,
      branch: 'main',
      filter: { include: [], exclude: [] },
      minSeverity: 'notice',
    });
    expect(result.annotations).toHaveLength(0);
    expect(result.latestRunByWorkflowPath.get('.github/workflows/ci.yml')).toBeNull();
  });
});
