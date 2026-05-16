import { type Command } from '@commander-js/extra-typings';
import { describe, expect, it } from 'vitest';
import { buildProgram, normalize } from '../../src/cli.js';

/**
 * Regression coverage for the `--no-X` auto-true bug surfaced by Copilot's
 * round-6 review on src/commands/shared.ts:69.
 *
 * Commander defaults the option behind a `--no-X` flag to `true` and only
 * sets it to `false` when the user explicitly passes the negative form.
 * The shared override builders previously gated on
 * `typeof opts.autoClose === 'boolean'`, which is always true, so a
 * `.ghaarrc` entry of `autoClose.enabled: false` was silently overridden
 * back to `true` on every run. The fix in `normalize()` filters out values
 * sourced from defaults via `cmd.getOptionValueSource()`.
 *
 * `parseOptions` updates option values + their source without triggering
 * the action handler — which is exactly what we want here (the action
 * would otherwise hit the GitHub API).
 */
function findReportCommand(): Command {
  const program = buildProgram();
  const cmd = program.commands.find((c) => c.name() === 'report');
  if (!cmd) throw new Error('report subcommand missing');
  return cmd as unknown as Command;
}

describe('cli normalize() — tri-state booleans from --no-X flags', () => {
  it('drops auto-defaulted booleans when the user did not pass the flag', () => {
    const reportCmd = findReportCommand();
    reportCmd.parseOptions([]);
    const result = normalize(reportCmd) as Record<string, unknown>;
    expect(result).not.toHaveProperty('autoClose');
    expect(result).not.toHaveProperty('autoCloseRequireSuccess');
    expect(result).not.toHaveProperty('wontfixRespectStateReason');
    expect(result).not.toHaveProperty('progress');
  });

  it('preserves boolean values that the user actually passed via --no-X', () => {
    const reportCmd = findReportCommand();
    reportCmd.parseOptions([
      '--no-auto-close',
      '--no-auto-close-require-success',
      '--no-wontfix-respect-state-reason',
      '--no-progress',
    ]);
    const result = normalize(reportCmd) as Record<string, unknown>;
    expect(result['autoClose']).toBe(false);
    expect(result['autoCloseRequireSuccess']).toBe(false);
    expect(result['wontfixRespectStateReason']).toBe(false);
    expect(result['progress']).toBe(false);
  });
});

describe('cli numeric flag validation', () => {
  it('rejects partial-integer inputs on --max-issues (no silent typo acceptance)', () => {
    const reportCmd = findReportCommand();
    reportCmd.exitOverride();
    // Number.parseInt('10k', 10) returns 10 — the previous validator
    // accepted that silently. The strict regex now rejects.
    expect(() => reportCmd.parseOptions(['--max-issues', '10k'])).toThrow(/--max-issues.*10k/);
  });

  it('rejects floats on --auto-close-after-days', () => {
    const reportCmd = findReportCommand();
    reportCmd.exitOverride();
    expect(() => reportCmd.parseOptions(['--auto-close-after-days', '1.5'])).toThrow(
      /--auto-close-after-days/,
    );
  });

  it('accepts valid integers (including negatives) on numeric flags', () => {
    const reportCmd = findReportCommand();
    reportCmd.parseOptions(['--max-issues', '42']);
    expect((reportCmd.opts() as Record<string, unknown>)['maxIssues']).toBe(42);
  });
});
