/**
 * Named CLI exit codes — keep in sync with `docs/reference/cli.md` and
 * CLAUDE.md "CLI exit codes" table.
 */
export const EXIT_OK = 0;
/**
 * Generic runtime failure: auth error, API error, unhandled exception.
 * Raised implicitly via thrown errors caught by the CLI entrypoint.
 */
export const EXIT_ERROR = 1;
/**
 * `--fail-on-new` fired: the run completed successfully and at least one
 * new issue was filed. Distinct from `EXIT_ERROR` so PR-gate scripts can
 * tell "new noise to triage" apart from "pipeline broke".
 */
export const EXIT_NEW_ISSUES_FOUND = 2;
