import { describe, expect, it } from 'vitest';
import {
  listAnnotationsForCheckRun,
  listJobsForRun,
} from '../../../../src/core/github/annotations.js';
import type { OctokitInstance } from '../../../../src/core/github/client.js';
import { REPO } from '../../../helpers/fixtures.js';

interface PaginatedResponses<T> {
  pages: readonly T[][];
}

function makeOctokitForListJobs(
  pages: PaginatedResponses<{
    id: number;
    name: string;
    check_run_url: string | null;
  }>,
): OctokitInstance {
  return {
    paginate: {
      async *iterator() {
        for (const data of pages.pages) yield { data };
      },
    },
    actions: { listJobsForWorkflowRun: () => Promise.resolve({ data: [] }) },
  } as unknown as OctokitInstance;
}

function makeOctokitForListAnnotations(
  pages: PaginatedResponses<{
    annotation_level: string | null;
    message: string | null;
    title: string | null;
    raw_details: string | null;
    path: string | null;
    start_line: number | null;
    end_line: number | null;
  }>,
): OctokitInstance {
  return {
    paginate: {
      async *iterator() {
        for (const data of pages.pages) yield { data };
      },
    },
    checks: { listAnnotations: () => Promise.resolve({ data: [] }) },
  } as unknown as OctokitInstance;
}

describe('listJobsForRun', () => {
  it('skips jobs without a check_run_url', async () => {
    const octokit = makeOctokitForListJobs({
      pages: [
        [
          { id: 1, name: 'a', check_run_url: 'https://api.github.com/repos/x/y/check-runs/55' },
          { id: 2, name: 'b', check_run_url: null },
        ],
      ],
    });
    const jobs = await listJobsForRun(octokit, REPO, 999);
    expect(jobs).toEqual([{ id: 1, name: 'a', checkRunId: 55 }]);
  });

  it('paginates across pages', async () => {
    const octokit = makeOctokitForListJobs({
      pages: [
        [{ id: 1, name: 'a', check_run_url: '/check-runs/1' }],
        [{ id: 2, name: 'b', check_run_url: '/check-runs/2' }],
      ],
    });
    const jobs = await listJobsForRun(octokit, REPO, 1);
    expect(jobs.map((j) => j.id)).toEqual([1, 2]);
  });
});

describe('listAnnotationsForCheckRun', () => {
  it('coerces missing fields to safe defaults', async () => {
    const octokit = makeOctokitForListAnnotations({
      pages: [
        [
          {
            annotation_level: 'warning',
            message: 'msg',
            title: null,
            raw_details: null,
            path: 'a.ts',
            start_line: 1,
            end_line: 1,
          },
          {
            annotation_level: null,
            message: null,
            title: null,
            raw_details: null,
            path: null,
            start_line: null,
            end_line: null,
          },
        ],
      ],
    });
    const annotations = await listAnnotationsForCheckRun(octokit, REPO, 1);
    expect(annotations[0]!.level).toBe('warning');
    // `annotation_level: null` is an unrecognized value → falls into the
    // fail-safe-ish default ('warning'). See normalizeLevel comment in
    // src/core/github/annotations.ts.
    expect(annotations[1]!.level).toBe('warning');
    expect(annotations[1]!.message).toBe('');
    expect(annotations[1]!.path).toBe('');
  });

  it('passes through the three valid levels', async () => {
    const octokit = makeOctokitForListAnnotations({
      pages: [
        [
          {
            annotation_level: 'notice',
            message: '',
            title: null,
            raw_details: null,
            path: '',
            start_line: null,
            end_line: null,
          },
          {
            annotation_level: 'failure',
            message: '',
            title: null,
            raw_details: null,
            path: '',
            start_line: null,
            end_line: null,
          },
          {
            annotation_level: 'unknown',
            message: '',
            title: null,
            raw_details: null,
            path: '',
            start_line: null,
            end_line: null,
          },
        ],
      ],
    });
    const annotations = await listAnnotationsForCheckRun(octokit, REPO, 1);
    // Unknown / unrecognized levels now default to 'warning' (was previously
    // 'notice', a silent downgrade that could let a future API value sneak
    // past --min-severity warning filters).
    expect(annotations.map((a) => a.level)).toEqual(['notice', 'failure', 'warning']);
  });
});
