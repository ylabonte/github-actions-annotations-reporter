import type { OctokitInstance } from './client.js';
import type { AnnotationLevel, JobInfo, RawAnnotation, RepoRef } from '../types.js';

export async function listJobsForRun(
  octokit: OctokitInstance,
  ref: RepoRef,
  runId: number,
): Promise<JobInfo[]> {
  const results: JobInfo[] = [];
  for await (const { data } of octokit.paginate.iterator(octokit.actions.listJobsForWorkflowRun, {
    owner: ref.owner,
    repo: ref.repo,
    run_id: runId,
    per_page: 100,
  })) {
    for (const job of data) {
      const checkRunId = extractCheckRunId(job.check_run_url);
      if (checkRunId == null) continue;
      results.push({ id: job.id, name: job.name, checkRunId });
    }
  }
  return results;
}

export async function listAnnotationsForCheckRun(
  octokit: OctokitInstance,
  ref: RepoRef,
  checkRunId: number,
): Promise<RawAnnotation[]> {
  const results: RawAnnotation[] = [];
  for await (const { data } of octokit.paginate.iterator(octokit.checks.listAnnotations, {
    owner: ref.owner,
    repo: ref.repo,
    check_run_id: checkRunId,
    per_page: 100,
  })) {
    for (const raw of data) {
      const cast = raw as {
        annotation_level: string | null | undefined;
        message: string | null | undefined;
        title: string | null | undefined;
        raw_details: string | null | undefined;
        path: string | null | undefined;
        start_line: number | null | undefined;
        end_line: number | null | undefined;
      };
      results.push({
        level: normalizeLevel(cast.annotation_level),
        message: cast.message ?? '',
        title: cast.title ?? null,
        rawDetails: cast.raw_details ?? null,
        path: cast.path ?? '',
        startLine: cast.start_line ?? null,
        endLine: cast.end_line ?? null,
      });
    }
  }
  return results;
}

function normalizeLevel(level: string | null | undefined): AnnotationLevel {
  if (level === 'notice' || level === 'warning' || level === 'failure') return level;
  return 'notice';
}

function extractCheckRunId(checkRunUrl: string | null | undefined): number | null {
  if (!checkRunUrl) return null;
  const match = /\/check-runs\/(\d+)/.exec(checkRunUrl);
  if (match?.[1] == null) return null;
  return Number.parseInt(match[1], 10);
}
