import { describe, expect, it } from 'vitest';
import { createOctokit } from '../../../../src/core/github/client.js';

describe('createOctokit', () => {
  it('builds an Octokit instance without a token (anonymous)', () => {
    const octokit = createOctokit({ token: null });
    expect(octokit).toBeDefined();
    expect(typeof octokit.request).toBe('function');
  });

  it('builds an Octokit instance with a token and custom base URL', () => {
    const octokit = createOctokit({
      token: 'xyz',
      userAgent: 'test',
      baseUrl: 'https://example.invalid',
    });
    expect(octokit).toBeDefined();
  });
});
