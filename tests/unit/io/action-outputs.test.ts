import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  let setOutput: ReturnType<typeof vi.spyOn>;
  let setFailed: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env['GITHUB_ACTIONS'];

  beforeEach(() => {
    setOutput = vi.spyOn(core, 'setOutput').mockImplementation(() => undefined);
    setFailed = vi.spyOn(core, 'setFailed').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['GITHUB_ACTIONS'];
    else process.env['GITHUB_ACTIONS'] = originalEnv;
    setOutput.mockRestore();
    setFailed.mockRestore();
  });

  it('emits no outputs when not running in GitHub Actions', () => {
    delete process.env['GITHUB_ACTIONS'];
    emitActionOutputs({ summary, jsonPath: '/tmp/x.json' });
    expect(setOutput).not.toHaveBeenCalled();
  });

  it('emits the full set of outputs in Actions env', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    emitActionOutputs({ summary, jsonPath: '/tmp/x.json' });
    expect(setOutput).toHaveBeenCalledWith('new-issues', 2);
    expect(setOutput).toHaveBeenCalledWith('updated-issues', 1);
    expect(setOutput).toHaveBeenCalledWith('suppressed', 1);
    expect(setOutput).toHaveBeenCalledWith('auto-close-held', 0);
    expect(setOutput).toHaveBeenCalledWith('skipped', 0);
    expect(setOutput).toHaveBeenCalledWith('total-annotations', 4);
    expect(setOutput).toHaveBeenCalledWith('json', '/tmp/x.json');
  });

  it('skips json output when path is null', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    emitActionOutputs({ summary, jsonPath: null });
    const calls = (setOutput.mock.calls as unknown as [string, ...unknown[]][]).map((c) => c[0]);
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
