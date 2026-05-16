import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
// `@actions/core` v3 ships pure ESM with non-configurable exports, so the
// old `vi.spyOn(core, 'setOutput')` approach throws "Cannot redefine
// property". The vitest-canonical way is `vi.mock('@actions/core', ...)`
// with a factory of `vi.fn()` stubs; vitest hoists the mock above the
// imports so subsequent `import * as core` resolves to the stubs.
vi.mock('@actions/core', () => ({
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));
import * as core from '@actions/core';
import {
  emitActionOutputs,
  failAction,
  isGitHubActionsEnv,
} from '../../../src/io/action-outputs.js';
import type { ReportSummary } from '../../../src/core/types.js';

const summary: ReportSummary = {
  totalAnnotations: 4,
  newIssues: 2,
  updatedIssues: 1,
  reopenedIssues: 0,
  suppressed: 1,
  autoClosed: 0,
  autoCloseHeld: 0,
  skipped: 0,
  dryRun: false,
};

describe('isGitHubActionsEnv', () => {
  it('returns true when GITHUB_ACTIONS=true', () => {
    expect(isGitHubActionsEnv({ GITHUB_ACTIONS: 'true' })).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isGitHubActionsEnv({})).toBe(false);
    expect(isGitHubActionsEnv({ GITHUB_ACTIONS: 'false' })).toBe(false);
  });
});

describe('emitActionOutputs / failAction', () => {
  const setOutput = vi.mocked(core.setOutput);
  const setFailed = vi.mocked(core.setFailed);
  const originalEnv = process.env['GITHUB_ACTIONS'];

  beforeEach(() => {
    setOutput.mockReset();
    setFailed.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['GITHUB_ACTIONS'];
    else process.env['GITHUB_ACTIONS'] = originalEnv;
  });

  it('emits no outputs when not running in GitHub Actions', () => {
    delete process.env['GITHUB_ACTIONS'];
    emitActionOutputs({ summary, jsonPath: '/tmp/x.json' });
    expect(setOutput).not.toHaveBeenCalled();
  });

  it('emits the full set of outputs in Actions env', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    emitActionOutputs({ summary, jsonPath: '/tmp/x.json' });
    // Assert every output the action contract documents. The exact-set
    // assertion below guarantees a regression that silently drops one
    // (or adds an undocumented one) breaks this test.
    expect(setOutput).toHaveBeenCalledWith('new-issues', 2);
    expect(setOutput).toHaveBeenCalledWith('updated-issues', 1);
    expect(setOutput).toHaveBeenCalledWith('reopened-issues', 0);
    expect(setOutput).toHaveBeenCalledWith('suppressed', 1);
    expect(setOutput).toHaveBeenCalledWith('auto-closed', 0);
    expect(setOutput).toHaveBeenCalledWith('auto-close-held', 0);
    expect(setOutput).toHaveBeenCalledWith('skipped', 0);
    expect(setOutput).toHaveBeenCalledWith('total-annotations', 4);
    expect(setOutput).toHaveBeenCalledWith('json', '/tmp/x.json');
    // Exact-set guard: 9 documented outputs (8 summary counters + json).
    const emittedKeys = setOutput.mock.calls.map((c) => c[0]);
    expect([...emittedKeys].toSorted()).toEqual(
      [
        'auto-close-held',
        'auto-closed',
        'json',
        'new-issues',
        'reopened-issues',
        'skipped',
        'suppressed',
        'total-annotations',
        'updated-issues',
      ].toSorted(),
    );
  });

  it('skips json output when path is null', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    emitActionOutputs({ summary, jsonPath: null });
    const calls = setOutput.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('json');
  });

  it('failAction routes through core.setFailed only in Actions env', () => {
    delete process.env['GITHUB_ACTIONS'];
    failAction('boom');
    expect(setFailed).not.toHaveBeenCalled();

    process.env['GITHUB_ACTIONS'] = 'true';
    failAction('boom');
    expect(setFailed).toHaveBeenCalledWith('boom');
  });
});
