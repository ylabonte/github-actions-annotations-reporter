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
