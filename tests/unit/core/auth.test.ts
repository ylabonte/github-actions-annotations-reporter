import { describe, expect, it, vi } from 'vitest';
import { resolveAuth } from '../../../src/core/auth.js';

describe('resolveAuth', () => {
  it('prefers an explicit token over everything else', async () => {
    const result = await resolveAuth({
      explicitToken: 'xyz',
      env: { GITHUB_TOKEN: 'env-token' },
      runGhCli: vi.fn(),
    });
    expect(result.source).toBe('explicit');
    expect(result.token).toBe('xyz');
  });

  it('falls back to GITHUB_TOKEN', async () => {
    const result = await resolveAuth({ env: { GITHUB_TOKEN: '  env-token  ' }, runGhCli: vi.fn() });
    expect(result.source).toBe('env');
    expect(result.token).toBe('env-token');
  });

  it('falls back to GH_TOKEN if GITHUB_TOKEN is missing', async () => {
    const result = await resolveAuth({ env: { GH_TOKEN: 'gh-token' }, runGhCli: vi.fn() });
    expect(result.token).toBe('gh-token');
  });

  it('calls gh CLI when env tokens are missing', async () => {
    const runGhCli = vi.fn().mockResolvedValue('cli-token');
    const result = await resolveAuth({ env: {}, runGhCli });
    expect(result.source).toBe('gh-cli');
    expect(result.token).toBe('cli-token');
  });

  it('returns anonymous when nothing is available', async () => {
    const result = await resolveAuth({ env: {}, runGhCli: vi.fn().mockResolvedValue(null) });
    expect(result.source).toBe('anonymous');
    expect(result.token).toBeNull();
  });

  it('returns anonymous when gh CLI throws', async () => {
    const result = await resolveAuth({
      env: {},
      runGhCli: vi.fn().mockRejectedValue(new Error('not installed')),
    });
    expect(result.source).toBe('anonymous');
  });
});
