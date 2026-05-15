# CLI reference

The `ghaar` CLI is the same binary used by the composite GitHub Action. It takes
the same flags whether invoked directly or via the action wrapper.

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
                                     GITHUB_REPOSITORY)
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
                                     GITHUB_REPOSITORY)
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
  --fail-on-new                      Exit non-zero if any new issues were
                                     created
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
                                     GITHUB_REPOSITORY)
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
