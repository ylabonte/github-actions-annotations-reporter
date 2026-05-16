import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OctokitInstance } from './client.js';
import type { RepoRef } from '../types.js';

const execFileAsync = promisify(execFile);

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

// Three GitHub-only forms. Custom GitHub Enterprise Server hostnames are
// deliberately not matched because the rest of the codebase is hardcoded to
// api.github.com — silently auto-detecting a GHES origin would just produce
// confusing auth errors several layers deep.
const GITHUB_REMOTE_PATTERNS = [
  // git@github.com:owner/repo[.git]
  /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  // [git+]ssh://[user@]github.com[:port]/owner/repo[.git]
  /^(?:git\+)?ssh:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  // [git+]https://[creds@]github.com/owner/repo[.git]
  /^(?:git\+)?https?:\/\/(?:[^@/]+@)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
] as const;

export function parseGitHubRemoteUrl(url: string): RepoRef | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  for (const pattern of GITHUB_REMOTE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match?.[1] && match[2]) return { owner: match[1], repo: match[2] };
  }
  return null;
}

export interface ResolveRepoFromGitRemoteOptions {
  readonly cwd?: string;
  readonly remoteName?: string;
  readonly runGit?: (args: readonly string[], cwd?: string) => Promise<string | null>;
}

/**
 * Read `git remote get-url <remoteName>` (default: `origin`) and parse it
 * into an `owner/repo` pair. Returns `null` for any failure — git missing,
 * not a repo, no such remote, or a non-GitHub URL. Never throws.
 */
export async function resolveRepoFromGitRemote(
  options: ResolveRepoFromGitRemoteOptions = {},
): Promise<RepoRef | null> {
  const remoteName = options.remoteName ?? 'origin';
  const runGit = options.runGit ?? defaultRunGit;
  try {
    const stdout = await runGit(['remote', 'get-url', remoteName], options.cwd);
    if (!stdout) return null;
    return parseGitHubRemoteUrl(stdout);
  } catch {
    return null;
  }
}

/* c8 ignore start — system-boundary: would need a real `git` binary to exercise. */
async function defaultRunGit(args: readonly string[], cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      ...(cwd ? { cwd } : {}),
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
/* c8 ignore stop */

export interface ResolveRepoOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly notify?: (msg: string) => void;
  readonly runGit?: ResolveRepoFromGitRemoteOptions['runGit'];
}

/**
 * Three-step repository resolution: explicit (`--repo`) → `GITHUB_REPOSITORY`
 * env → local `git remote get-url origin`. The `notify` callback fires only
 * when the git-remote step wins, so callers can print a one-line "Resolved
 * repo from git remote" hint without it being noisy in CI (where the env
 * step wins).
 */
export async function resolveRepo(
  explicit: RepoRef | undefined,
  options: ResolveRepoOptions = {},
): Promise<RepoRef | null> {
  if (explicit) return explicit;

  const fromEnv = resolveRepoFromEnv(options.env);
  if (fromEnv) return fromEnv;

  const fromGit = await resolveRepoFromGitRemote({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.runGit ? { runGit: options.runGit } : {}),
  });
  if (fromGit) {
    options.notify?.(
      `Resolved repo ${fromGit.owner}/${fromGit.repo} from local git remote 'origin'.`,
    );
    return fromGit;
  }

  return null;
}

export async function getDefaultBranch(octokit: OctokitInstance, ref: RepoRef): Promise<string> {
  const { data } = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });
  return data.default_branch;
}
