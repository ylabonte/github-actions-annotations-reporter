import { Octokit } from '@octokit/rest';

export type OctokitInstance = InstanceType<typeof Octokit>;

export interface GitHubClientOptions {
  readonly token: string | null;
  readonly userAgent?: string;
  readonly baseUrl?: string;
}

export function createOctokit(options: GitHubClientOptions): OctokitInstance {
  return new Octokit({
    ...(options.token ? { auth: options.token } : {}),
    userAgent: options.userAgent ?? 'github-actions-annotations-reporter',
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
}
