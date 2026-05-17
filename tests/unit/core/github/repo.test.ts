import { describe, expect, it, vi } from 'vitest';
import {
  getDefaultBranch,
  parseGitHubRemoteUrl,
  parseRepoSlug,
  resolveRepo,
  resolveRepoFromEnv,
  resolveRepoFromGitRemote,
} from '../../../../src/core/github/repo.js';

describe('parseRepoSlug', () => {
  it('parses owner/repo', () => {
    expect(parseRepoSlug('foo/bar')).toEqual({ owner: 'foo', repo: 'bar' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseRepoSlug('  a/b  ')).toEqual({ owner: 'a', repo: 'b' });
  });

  it('throws on invalid input', () => {
    expect(() => parseRepoSlug('not-a-slug')).toThrow();
    expect(() => parseRepoSlug('a/b/c')).toThrow();
    expect(() => parseRepoSlug('')).toThrow();
  });
});

describe('resolveRepoFromEnv', () => {
  it('returns null when env var is missing', () => {
    expect(resolveRepoFromEnv({})).toBeNull();
  });

  it('parses GITHUB_REPOSITORY', () => {
    expect(resolveRepoFromEnv({ GITHUB_REPOSITORY: 'owner/name' })).toEqual({
      owner: 'owner',
      repo: 'name',
    });
  });
});

describe('parseGitHubRemoteUrl', () => {
  it.each([
    ['git@github.com:foo/bar.git', { owner: 'foo', repo: 'bar' }],
    ['git@github.com:foo/bar', { owner: 'foo', repo: 'bar' }],
    ['ssh://git@github.com/foo/bar.git', { owner: 'foo', repo: 'bar' }],
    ['ssh://git@github.com:22/foo/bar.git', { owner: 'foo', repo: 'bar' }],
    ['https://github.com/foo/bar.git', { owner: 'foo', repo: 'bar' }],
    ['https://github.com/foo/bar', { owner: 'foo', repo: 'bar' }],
    ['http://github.com/foo/bar', { owner: 'foo', repo: 'bar' }],
    ['https://x-access-token:gho_xyz@github.com/foo/bar.git', { owner: 'foo', repo: 'bar' }],
    ['https://github.com/foo/repo.with.dots.git', { owner: 'foo', repo: 'repo.with.dots' }],
  ])('parses %s', (url, expected) => {
    expect(parseGitHubRemoteUrl(url)).toEqual(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(parseGitHubRemoteUrl('  git@github.com:a/b.git\n')).toEqual({ owner: 'a', repo: 'b' });
  });

  it.each([
    ['git@gitlab.com:foo/bar.git'],
    ['https://gitlab.com/foo/bar'],
    ['git@bitbucket.org:foo/bar.git'],
    ['ssh://git@ghes.example.com/foo/bar.git'],
    ['https://github.example.com/foo/bar.git'],
    ['file:///some/local/path'],
    ['not-a-url'],
    [''],
  ])('returns null for non-GitHub remote %s', (url) => {
    expect(parseGitHubRemoteUrl(url)).toBeNull();
  });

  // `git remote get-url` never produces these forms in practice, but a
  // user-configured remote could. Lock in the strict-anchored behavior of
  // GITHUB_REMOTE_PATTERNS: anything trailing beyond `[.git]` (slash, query
  // string, fragment, extra path segment) is treated as not-a-GitHub-remote
  // and falls through to the explicit `--repo` / GITHUB_REPOSITORY paths.
  it.each([
    ['https://github.com/foo/bar/'], // trailing slash
    ['https://github.com/foo/bar.git/'], // trailing slash after .git
    ['https://github.com/foo/bar.git?ref=main'], // query string
    ['https://github.com/foo/bar.git#readme'], // URL fragment
    ['https://github.com/foo/bar/extra'], // extra path segment
    ['https://github.com/foo'], // missing repo segment
    ['git@github.com:foo/bar.git/'], // SSH trailing slash
  ])('returns null for malformed-but-GitHub-host %s', (url) => {
    expect(parseGitHubRemoteUrl(url)).toBeNull();
  });
});

describe('resolveRepoFromGitRemote', () => {
  it('parses the output of `git remote get-url origin`', async () => {
    const runGit = vi.fn().mockResolvedValue('git@github.com:foo/bar.git');
    await expect(resolveRepoFromGitRemote({ runGit })).resolves.toEqual({
      owner: 'foo',
      repo: 'bar',
    });
    expect(runGit).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], undefined);
  });

  it('passes through cwd and a custom remoteName', async () => {
    const runGit = vi.fn().mockResolvedValue('https://github.com/owner/repo.git');
    await resolveRepoFromGitRemote({ runGit, cwd: '/tmp/elsewhere', remoteName: 'upstream' });
    expect(runGit).toHaveBeenCalledWith(['remote', 'get-url', 'upstream'], '/tmp/elsewhere');
  });

  it('returns null when git produces no output', async () => {
    const runGit = vi.fn().mockResolvedValue(null);
    await expect(resolveRepoFromGitRemote({ runGit })).resolves.toBeNull();
  });

  it('returns null when git rejects (not a repo, missing binary, …)', async () => {
    const runGit = vi.fn().mockRejectedValue(new Error('not a git repository'));
    await expect(resolveRepoFromGitRemote({ runGit })).resolves.toBeNull();
  });

  it('returns null for a non-GitHub remote URL', async () => {
    const runGit = vi.fn().mockResolvedValue('git@gitlab.com:foo/bar.git');
    await expect(resolveRepoFromGitRemote({ runGit })).resolves.toBeNull();
  });
});

describe('resolveRepo', () => {
  const explicit = { owner: 'ex', repo: 'plicit' };
  const envHit = { GITHUB_REPOSITORY: 'env/repo' };

  it('returns explicit unchanged and never touches env or git', async () => {
    const runGit = vi.fn();
    const notify = vi.fn();
    await expect(resolveRepo(explicit, { env: envHit, runGit, notify })).resolves.toEqual(explicit);
    expect(runGit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls through to env when explicit is missing', async () => {
    const runGit = vi.fn();
    const notify = vi.fn();
    await expect(resolveRepo(undefined, { env: envHit, runGit, notify })).resolves.toEqual({
      owner: 'env',
      repo: 'repo',
    });
    expect(runGit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls through to git-remote when neither explicit nor env match', async () => {
    const runGit = vi.fn().mockResolvedValue('git@github.com:from/git.git');
    const notify = vi.fn();
    await expect(resolveRepo(undefined, { env: {}, runGit, notify })).resolves.toEqual({
      owner: 'from',
      repo: 'git',
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('from/git'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("git remote 'origin'"));
  });

  it('returns null and skips notify when every source fails', async () => {
    const runGit = vi.fn().mockResolvedValue(null);
    const notify = vi.fn();
    await expect(resolveRepo(undefined, { env: {}, runGit, notify })).resolves.toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('getDefaultBranch', () => {
  it('returns the default_branch field from repos.get', async () => {
    const octokit = {
      repos: {
        get: async () => ({ data: { default_branch: 'develop' } }),
      },
    } as unknown as Parameters<typeof getDefaultBranch>[0];
    expect(await getDefaultBranch(octokit, { owner: 'a', repo: 'b' })).toBe('develop');
  });
});
