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
//
// The owner and repo character classes are restricted to `[A-Za-z0-9._-]` —
// the actual GitHub naming rules. Crucially this excludes the URL-meta
// characters `?` (query) and `#` (fragment), which a more permissive
// `[^/\s]+?` pattern would otherwise lazily absorb into the repo capture
// (e.g. `https://github.com/foo/bar.git?ref=main` would parse to
// `{ owner: 'foo', repo: 'bar.git?ref=main' }` instead of `null`).
const OWNER_REPO = '[A-Za-z0-9._-]+';
const GITHUB_REMOTE_PATTERNS = [
  // git@github.com:owner/repo[.git]
  new RegExp(String.raw`^git@github\.com:(${OWNER_REPO})/(${OWNER_REPO}?)(?:\.git)?$`),
  // [git+]ssh://[user@]github.com[:port]/owner/repo[.git]
  new RegExp(
    String.raw`^(?:git\+)?ssh://(?:[^@/]+@)?github\.com(?::\d+)?/(${OWNER_REPO})/(${OWNER_REPO}?)(?:\.git)?$`,
  ),
  // [git+]https://[creds@]github.com/owner/repo[.git]
  new RegExp(
    String.raw`^(?:git\+)?https?://(?:[^@/]+@)?github\.com/(${OWNER_REPO})/(${OWNER_REPO}?)(?:\.git)?$`,
  ),
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
  /**
   * Override the audit-line emitter. Defaults to writing a single line to
   * stderr — see `defaultResolveRepoNotify`. Passing a no-op function fully
   * silences the notice; passing a `vi.fn()` is the test pattern. Callers
   * who want the line piped somewhere specific (a logger, an Action
   * annotation, a file) can plug in here.
   */
  readonly notify?: (msg: string) => void;
  readonly runGit?: ResolveRepoFromGitRemoteOptions['runGit'];
}

/**
 * Default notify implementation — writes the "Resolved repo …" line to
 * stderr unconditionally. It's an audit signal ("where did the target repo
 * come from?"), not spinner UX, so it must not be gated by --json /
 * --no-progress / non-TTY modes. stdout is reserved for the JSON report.
 *
 * Exposed as a separate function so tests can spy on it via the `notify`
 * option without duplicating the message string.
 */
function defaultResolveRepoNotify(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

/**
 * Three-step repository resolution: explicit (`--repo`) → `GITHUB_REPOSITORY`
 * env → local `git remote get-url origin`. The `notify` callback fires only
 * when the git-remote step wins, so callers see a one-line "Resolved repo
 * from git remote" hint without it being noisy in CI (where the env step
 * wins). When not overridden, the notice goes to stderr.
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
    const notify = options.notify ?? defaultResolveRepoNotify;
    notify(`Resolved repo ${fromGit.owner}/${fromGit.repo} from local git remote 'origin'.`);
    return fromGit;
  }

  return null;
}

export async function getDefaultBranch(octokit: OctokitInstance, ref: RepoRef): Promise<string> {
  const { data } = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });
  return data.default_branch;
}
