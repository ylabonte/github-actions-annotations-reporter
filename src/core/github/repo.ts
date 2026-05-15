import type { OctokitInstance } from './client.js';
import type { RepoRef } from '../types.js';

export function parseRepoSlug(slug: string): RepoRef {
  const trimmed = slug.trim();
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`Invalid repository slug ${JSON.stringify(slug)} — expected "owner/repo".`);
  }
  return { owner: match[1], repo: match[2] };
}

export function resolveRepoFromEnv(env: NodeJS.ProcessEnv = process.env): RepoRef | null {
  const slug = env['GITHUB_REPOSITORY'];
  if (!slug) return null;
  return parseRepoSlug(slug);
}

export async function getDefaultBranch(octokit: OctokitInstance, ref: RepoRef): Promise<string> {
  const { data } = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });
  return data.default_branch;
}
