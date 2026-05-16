#!/usr/bin/env node
import { Command, InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runScanCommand } from './commands/scan.js';
import { runReportCommand } from './commands/report.js';
import { runListCommand } from './commands/list.js';
import { failAction } from './io/action-outputs.js';
import type { CommonCliOptions } from './commands/shared.js';

const require = createRequire(import.meta.url);
interface PackageJson {
  readonly version: string;
}
const pkg = require('../package.json') as PackageJson;

/**
 * Build the commander program without executing it. Exported for documentation
 * tooling (`docs/scripts/gen-cli-ref.ts`) which calls `.helpInformation()`.
 */
export function buildProgram(): Command {
  const program = new Command()
    .name('ghaar')
    .description(
      'Scan the latest GitHub Actions workflow runs for annotations and file dedup-aware GitHub Issues.',
    )
    .version(pkg.version);

  program
    .addCommand(
      buildCommand('scan', 'Scan and print/report; never writes issues')
        .option(
          '--list-annotations',
          'Print every found annotation with full detail (also adds `annotations[]` to the JSON report)',
        )
        .action(async (_args, cmd) => {
          process.exitCode = await runScanCommand(normalize(cmd));
        }),
    )
    .addCommand(
      buildCommand('report', 'Scan and reconcile issues (creates, updates, reopens, auto-closes)')
        .option(
          '--list-annotations',
          'Print every found annotation with full detail (also adds `annotations[]` to the JSON report)',
        )
        .option('--fail-on-new', 'Exit non-zero if any new issues were created')
        .action(async (_args, cmd) => {
          process.exitCode = await runReportCommand(normalize(cmd));
        }),
    )
    .addCommand(
      buildCommand('list', 'List currently-managed issues').action(async (_args, cmd) => {
        process.exitCode = await runListCommand(normalize(cmd));
      }),
    );

  return program;
}

function buildCommand(name: string, description: string): Command {
  const cmd = new Command(name).description(description);
  cmd
    .option('--token <token>', 'GitHub token (falls back to GITHUB_TOKEN / gh auth token)')
    .option('--repo <owner/name>', 'Target repository (falls back to GITHUB_REPOSITORY)')
    .option(
      '--branch <branch>',
      'Branch whose latest run is scanned (defaults to repo default branch)',
    )
    .option('--workflows <glob...>', 'Workflow include globs (matched against name and path)')
    .option('--reject <glob...>', 'Workflow exclude globs')
    .addOption(
      new Option('--min-severity <severity>', 'Minimum severity to file').choices([
        'notice',
        'warning',
        'error',
      ]),
    )
    .option('--management-label <name>', 'Label applied to managed issues')
    .option('--max-issues <n>', 'Cap on writes per run', parseIntegerArg('--max-issues'))
    .option('--wontfix-labels <label...>', 'Labels treated as "won\'t fix" suppressions')
    .option('--no-wontfix-respect-state-reason', 'Ignore state_reason=not_planned suppression')
    .option('--wontfix-comment-pattern <regex>', 'Regex matched against closing comments')
    .option('--no-auto-close', 'Disable auto-close of vanished annotations')
    .option(
      '--auto-close-after-days <n>',
      'Min absence days before auto-close',
      parseIntegerArg('--auto-close-after-days'),
    )
    .option(
      '--auto-close-after-misses <n>',
      'Min consecutive misses before auto-close',
      parseIntegerArg('--auto-close-after-misses'),
    )
    .option('--no-auto-close-require-success', 'Allow auto-close even when latest run failed')
    .option('--json', 'Emit a JSON report to stdout')
    .option('--json-out <path>', 'Write JSON report to a file')
    .option('--dry-run', 'Do not create/update/close any issues')
    .option(
      '--no-progress',
      'Disable progress indicators (auto-disabled in non-TTY and --json modes)',
    );
  return cmd;
}

/**
 * Strict integer coercion for numeric flags. `Number.parseInt('10abc', 10)`
 * returns `10` without error, so a user mistyping `--max-issues 10k` would
 * silently get `10`. We require the entire input to match `^-?\d+$` so a
 * typo produces a precise CLI error instead of a half-parsed value.
 */
function parseIntegerArg(flag: string): (value: string) => number {
  return (value) => {
    if (!/^-?\d+$/.test(value)) {
      throw new InvalidArgumentError(`${flag} expects an integer, got "${value}"`);
    }
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) {
      throw new InvalidArgumentError(`${flag} expects an integer, got "${value}"`);
    }
    return n;
  };
}

/**
 * Distinguish "user passed the flag" from "commander defaulted it" for
 * tri-state booleans declared via `--no-X` syntax. Without this, the auto-
 * `true` default applies on every invocation and silently overrides a
 * `false` value in the user's `.ghaarrc` config file. Drop any key whose
 * value didn't come from the CLI so downstream merge logic only sees an
 * explicit user choice.
 */
const TRI_STATE_BOOLEAN_KEYS = [
  'autoClose',
  'autoCloseRequireSuccess',
  'wontfixRespectStateReason',
  'progress',
] as const;

export function normalize(cmd: Command): CommonCliOptions {
  const opts = cmd.opts() as Record<string, unknown>;
  const minSeverity =
    opts['minSeverity'] === 'notice' ||
    opts['minSeverity'] === 'warning' ||
    opts['minSeverity'] === 'error'
      ? opts['minSeverity']
      : undefined;
  const out: Record<string, unknown> = { ...opts };
  delete out['minSeverity'];
  if (minSeverity) out['minSeverity'] = minSeverity;

  for (const key of TRI_STATE_BOOLEAN_KEYS) {
    if (cmd.getOptionValueSource(key) !== 'cli') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete out[key];
    }
  }
  return out;
}

// Only auto-invoke when run as the main entry point. Importing this module
// (e.g. from `docs/scripts/gen-cli-ref.ts`) must NOT trigger arg parsing.
// `pathToFileURL` handles Windows drive letters and backslashes correctly;
// a hand-built `file://${argv[1]}` would produce a malformed URL on Windows.
const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

/* c8 ignore start — exercised only as the CLI entrypoint, not in tests. */
if (isMainModule) {
  void buildProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`ghaar: ${message}\n`);
      failAction(message);
      process.exitCode = 1;
    });
}
/* c8 ignore stop */
