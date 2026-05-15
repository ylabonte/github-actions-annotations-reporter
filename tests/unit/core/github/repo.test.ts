import { describe, expect, it } from 'vitest';
import {
  getDefaultBranch,
  parseRepoSlug,
  resolveRepoFromEnv,
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
