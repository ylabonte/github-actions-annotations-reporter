# CLI reference

The `ghaar` CLI is the same binary used by the composite GitHub Action. It takes
the same flags whether invoked directly or via the action wrapper.

## Exit codes

| Code | When                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | The pipeline ran. By default, finding / filing / updating issues exits 0.                                                                               |
| `1`  | A runtime error: auth failure, repo resolution failure, GitHub API failure, unhandled exception.                                                        |
| `2`  | `--fail-on-new` was passed and the run created at least one new issue. Use this in PR gates to distinguish "new noise to triage" from "pipeline broke". |

Shell pipelines branching on the code can rely on the contract above; the values are defined as named constants in `src/commands/exit-codes.ts`.

## Generated flag reference

The block below is regenerated from the live commander definition by
`pnpm docs:gen-cli`. **Do not edit it by hand** — your changes will be
overwritten on the next regeneration. To change the help text, edit
`src/cli.ts` and re-run the script.

<!-- AUTOGEN:BEGIN -->

## Top-level

```
Usage: ghaar [options] [command]

Scan the latest GitHub Actions workflow runs for annotations and file
dedup-aware GitHub Issues.

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  scan [options]    Scan and print/report; never writes issues
  report [options]  Scan and reconcile issues (creates, updates, reopens,
                    auto-closes)
  list [options]    List currently-managed issues
  help [command]    display help for command

Examples:
  $ ghaar scan --dry-run                       # Preview what would be filed; never writes.
  $ ghaar report --min-severity warning        # File issues for warnings + errors.
  $ ghaar report --json-out report.json        # Same, plus a structured JSON report.
  $ ghaar list                                 # List currently-managed issues by label.

Repository resolution:
  --repo <owner/name>   →   $GITHUB_REPOSITORY   →   git remote get-url origin
  The first one that resolves wins. Run from inside a cloned GitHub repo and
  no flag is needed.

Authentication:
  --token <token>       →   $GITHUB_TOKEN  →  $GH_TOKEN  →  `gh auth token`
  Anonymous is allowed but rate-limited (60 req/hr) and cannot create issues.

Exit codes:
  0  success — command completed successfully.
  1  error  — auth, repo resolution, or GitHub API failure.
  2  --fail-on-new was set and at least one new issue was created.

Full docs: https://ylabonte.github.io/github-actions-annotations-reporter/
```

## Subcommands

### `ghaar scan`

```
Usage: ghaar scan [options]

Scan and print/report; never writes issues

Options:
  --token <token>                    GitHub token (falls back to GITHUB_TOKEN /
                                     gh auth token)
  --repo <owner/name>                Target repository (falls back to
                                     GITHUB_REPOSITORY, then to the local git
                                     remote 'origin')
  --branch <branch>                  Branch whose latest run is scanned
                                     (defaults to repo default branch)
  --workflows <glob...>              Workflow include globs (matched against
                                     name and path)
  --reject <glob...>                 Workflow exclude globs
  --min-severity <severity>          Minimum severity to file (choices:
                                     "notice", "warning", "error")
  --management-label <name>          Label applied to managed issues
  --max-issues <n>                   Cap on writes per run
  --wontfix-labels <label...>        Labels treated as "won't fix" suppressions
  --no-wontfix-respect-state-reason  Ignore state_reason=not_planned suppression
  --wontfix-comment-pattern <regex>  Regex matched against closing comments
  --no-auto-close                    Disable auto-close of vanished annotations
  --auto-close-after-days <n>        Min absence days before auto-close
  --auto-close-after-misses <n>      Min consecutive misses before auto-close
  --no-auto-close-require-success    Allow auto-close even when latest run
                                     failed
  --json                             Emit a JSON report to stdout
  --json-out <path>                  Write JSON report to a file
  --dry-run                          Do not create/update/close any issues
  --no-progress                      Disable progress indicators (auto-disabled
                                     in non-TTY and --json modes)
  --list-annotations                 Print every found annotation with full
                                     detail (also adds `annotations[]` to the
                                     JSON report)
  -h, --help                         display help for command
```

### `ghaar report`

```
Usage: ghaar report [options]

Scan and reconcile issues (creates, updates, reopens, auto-closes)

Options:
  --token <token>                    GitHub token (falls back to GITHUB_TOKEN /
                                     gh auth token)
  --repo <owner/name>                Target repository (falls back to
                                     GITHUB_REPOSITORY, then to the local git
                                     remote 'origin')
  --branch <branch>                  Branch whose latest run is scanned
                                     (defaults to repo default branch)
  --workflows <glob...>              Workflow include globs (matched against
                                     name and path)
  --reject <glob...>                 Workflow exclude globs
  --min-severity <severity>          Minimum severity to file (choices:
                                     "notice", "warning", "error")
  --management-label <name>          Label applied to managed issues
  --max-issues <n>                   Cap on writes per run
  --wontfix-labels <label...>        Labels treated as "won't fix" suppressions
  --no-wontfix-respect-state-reason  Ignore state_reason=not_planned suppression
  --wontfix-comment-pattern <regex>  Regex matched against closing comments
  --no-auto-close                    Disable auto-close of vanished annotations
  --auto-close-after-days <n>        Min absence days before auto-close
  --auto-close-after-misses <n>      Min consecutive misses before auto-close
  --no-auto-close-require-success    Allow auto-close even when latest run
                                     failed
  --json                             Emit a JSON report to stdout
  --json-out <path>                  Write JSON report to a file
  --dry-run                          Do not create/update/close any issues
  --no-progress                      Disable progress indicators (auto-disabled
                                     in non-TTY and --json modes)
  --list-annotations                 Print every found annotation with full
                                     detail (also adds `annotations[]` to the
                                     JSON report)
  --fail-on-new                      Exit with code 2 if any new issues were
                                     created (distinct from code 1 for runtime
                                     errors)
  -h, --help                         display help for command
```

### `ghaar list`

```
Usage: ghaar list [options]

List currently-managed issues

Options:
  --token <token>                    GitHub token (falls back to GITHUB_TOKEN /
                                     gh auth token)
  --repo <owner/name>                Target repository (falls back to
                                     GITHUB_REPOSITORY, then to the local git
                                     remote 'origin')
  --branch <branch>                  Branch whose latest run is scanned
                                     (defaults to repo default branch)
  --workflows <glob...>              Workflow include globs (matched against
                                     name and path)
  --reject <glob...>                 Workflow exclude globs
  --min-severity <severity>          Minimum severity to file (choices:
                                     "notice", "warning", "error")
  --management-label <name>          Label applied to managed issues
  --max-issues <n>                   Cap on writes per run
  --wontfix-labels <label...>        Labels treated as "won't fix" suppressions
  --no-wontfix-respect-state-reason  Ignore state_reason=not_planned suppression
  --wontfix-comment-pattern <regex>  Regex matched against closing comments
  --no-auto-close                    Disable auto-close of vanished annotations
  --auto-close-after-days <n>        Min absence days before auto-close
  --auto-close-after-misses <n>      Min consecutive misses before auto-close
  --no-auto-close-require-success    Allow auto-close even when latest run
                                     failed
  --json                             Emit a JSON report to stdout
  --json-out <path>                  Write JSON report to a file
  --dry-run                          Do not create/update/close any issues
  --no-progress                      Disable progress indicators (auto-disabled
                                     in non-TTY and --json modes)
  -h, --help                         display help for command
```

<!-- AUTOGEN:END -->

## Environment variables

The CLI consults these env vars when the matching flag is not set. Anything passed via the CLI flag wins; multi-source env vars are tried in the order listed.

| Variable            | Purpose                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | Primary GitHub auth token. Read when `--token` is not set. Set automatically inside GitHub Actions runners.                                                                                                                                                                         |
| `GH_TOKEN`          | Alternative auth token, checked after `GITHUB_TOKEN`. Used by the GitHub CLI (`gh`); convenient for local dev where you may already have it exported.                                                                                                                               |
| `GITHUB_REPOSITORY` | `<owner>/<name>` slug. Read when `--repo` is not set. Set automatically inside GitHub Actions runners. When neither flag nor env is set, the CLI falls back to parsing `git remote get-url origin` in the current working directory; non-GitHub remotes (GHES, GitLab) are ignored. |
| `NO_COLOR`          | Standard convention — when set to any non-empty value, suppresses ANSI color in CLI output. The CLI defers to [picocolors](https://github.com/alexeyraspopov/picocolors) for the runtime detection.                                                                                 |
| `FORCE_COLOR`       | Standard convention — opposite of `NO_COLOR`, forces color output even when stdout/stderr isn't a TTY.                                                                                                                                                                              |
| `RUNNER_TEMP`       | Set automatically by GitHub Actions runners; the composite action stores its per-invocation JSON report under this directory. You should never need to set it manually.                                                                                                             |

If none of the auth sources produce a token, the CLI falls back to anonymous GitHub access — limited to 60 requests per hour and unable to write issues. The CLI will still attempt a scan and surface the rate-limit error if it hits one.
