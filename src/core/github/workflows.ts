import type { OctokitInstance } from './client.js';
import type { RepoRef, RunInfo, WorkflowInfo } from '../types.js';

export async function listRepoWorkflows(
  octokit: OctokitInstance,
  ref: RepoRef,
): Promise<WorkflowInfo[]> {
  const results: WorkflowInfo[] = [];
  for await (const { data } of octokit.paginate.iterator(octokit.actions.listRepoWorkflows, {
    owner: ref.owner,
    repo: ref.repo,
    per_page: 100,
  })) {
    for (const wf of data) {
      results.push({ id: wf.id, name: wf.name, path: wf.path, state: wf.state });
    }
  }
  return results;
}

export async function getLatestCompletedRun(
  octokit: OctokitInstance,
  ref: RepoRef,
  workflowId: number,
  branch: string,
): Promise<RunInfo | null> {
  const { data } = await octokit.actions.listWorkflowRuns({
    owner: ref.owner,
    repo: ref.repo,
    workflow_id: workflowId,
    branch,
    status: 'completed',
    per_page: 1,
  });
  const run = data.workflow_runs[0];
  if (!run) return null;
  // The installed Octokit types mark these fields as non-null (only
  // `head_branch` and `conclusion` are typed as nullable in the Octokit
  // schema today), so additional nullish-coalescing trips
  // `@typescript-eslint/no-unnecessary-condition`. If the upstream type
  // ever broadens (e.g. adds `head_sha: string | null`), tsc will fail
  // here and we'll add the coalescing back where it's actually needed.
  return {
    id: run.id,
    runNumber: run.run_number,
    htmlUrl: run.html_url,
    headBranch: run.head_branch ?? branch,
    headSha: run.head_sha,
    conclusion: run.conclusion as RunInfo['conclusion'],
    createdAt: run.created_at,
  };
}
