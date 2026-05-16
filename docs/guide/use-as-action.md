# Use as a GitHub Action

The repository ships a composite GitHub Action so you can run `ghaar`
inside any workflow without the npm-global install.

## Minimal usage

```yaml
name: Annotation reporter
on:
  workflow_dispatch:
  schedule:
    - cron: '17 6 * * *' # daily at 06:17 UTC

permissions:
  contents: read
  issues: write # required to file / update / close issues

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: ylabonte/github-actions-annotations-reporter@v1
```

That's it. With no inputs the action will scan every workflow on the
default branch, file issues for every annotation, and respect the default
won't-fix / auto-close settings.

### Version pinning

The `@v1` reference above is a **floating major tag**: every patch and minor
release in the `v1.x.y` line will be picked up automatically, including bug
fixes and security patches. For most consumers this is what you want.

If you need fully reproducible builds — e.g. for compliance or to lock the
action's exact behavior to a known-good revision — pin to an exact tag or
commit SHA instead:

```yaml
# Exact version (rebuildable, but you must bump manually for fixes):
- uses: ylabonte/github-actions-annotations-reporter@v1.2.3

# Or a full commit SHA (most immutable; gets a Dependabot bump when set):
- uses: ylabonte/github-actions-annotations-reporter@<40-char-sha>
```

The floating `v1` tag is updated by the release workflow with
`--force-with-lease`, so it always points at the highest released
`v1.x.y` — but the tag itself is mutable.

## Common patterns

### Warnings + errors only

```yaml
- uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    min-severity: warning
```

### Aggressive cleanup (close vanished issues fast)

```yaml
- uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    auto-close-after-days: '3'
    auto-close-after-misses: '2'
```

Strings, not numbers — composite-action input defaults are literal
strings, and YAML quoting is the safest form.

### Dry-run on every PR

```yaml
- uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    dry-run: 'true'
    fail-on-new: 'true' # exit non-zero if the scan would file a new issue
```

This is useful as a PR gate: surface "this PR is about to introduce a
new warning" without actually filing anything.

### Custom won't-fix labels

```yaml
- uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    wontfix-labels: 'wontfix,accepted-noise,not-our-problem'
```

Comma-separated. Closed issues carrying any of these labels suppress
future filings of the same fingerprint.

### List every annotation in the JSON report

Surface the full annotation set (message, raw details, file/line, run
URL, fingerprint, head SHA, etc.) in the JSON report so downstream
steps can consume it:

```yaml
- id: ghaar
  uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    dry-run: 'true'
    list-annotations: 'true'

- name: Summarize per-workflow
  run: |
    jq -r '.annotations | group_by(.workflow.path)
      | map("\(.[0].workflow.path): \(length) annotation(s)") | .[]' \
      "${{ steps.ghaar.outputs.json }}"
```

The `annotations` array is only present when `list-annotations` is `true`.
Without it, the JSON shape is unchanged — existing consumers keep working.

## Inputs

| Input                          | Default                          | Description                                                                                                 |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `version`                      | `1`                              | npm tag/version of the package to run via `npx`. Pinned to the action major.                                |
| `github-token`                 | workflow `github.token`          | Token used for API auth.                                                                                    |
| `workflows`                    | _(empty)_                        | Whitespace-separated globs of workflow names/paths to include. Individual globs may not contain whitespace. |
| `reject`                       | _(empty)_                        | Whitespace-separated globs to exclude. Same whitespace caveat as `workflows`.                               |
| `branch`                       | repo default branch              | Branch whose latest run is scanned per workflow.                                                            |
| `min-severity`                 | `notice`                         | Minimum severity to file (`notice` / `warning` / `error`).                                                  |
| `management-label`             | `automation/annotation-reporter` | Label applied to every managed issue.                                                                       |
| `max-issues`                   | `25`                             | Cap on create/update/reopen writes per run. Auto-close is unthrottled.                                      |
| `wontfix-labels`               | `wontfix`                        | Comma-separated labels treated as won't-fix on closed issues.                                               |
| `wontfix-respect-state-reason` | `true`                           | Honor `state_reason: not_planned` as a suppression signal.                                                  |
| `wontfix-comment-pattern`      | _(empty)_                        | Regex matched against the closing comment.                                                                  |
| `auto-close`                   | `true`                           | Auto-close managed issues whose annotation has vanished.                                                    |
| `auto-close-after-days`        | `7`                              | Min days since last-seen before auto-close.                                                                 |
| `auto-close-after-misses`      | `3`                              | Min consecutive misses before auto-close.                                                                   |
| `auto-close-require-success`   | `true`                           | Only consider auto-close when the workflow's latest run succeeded.                                          |
| `dry-run`                      | `false`                          | Log what would change without any writes.                                                                   |
| `fail-on-new`                  | `false`                          | Exit non-zero if any new issues were created.                                                               |
| `list-annotations`             | `false`                          | Include every found annotation (full detail) in the JSON report under `annotations[]`.                      |

## Outputs

| Output              | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `new-issues`        | Count of issues newly created on this run.                                      |
| `updated-issues`    | Count of existing open issues touched.                                          |
| `reopened-issues`   | Count of previously-closed issues reopened.                                     |
| `suppressed`        | Count of annotations skipped due to a won't-fix signal.                         |
| `auto-closed`       | Count of managed open issues auto-closed because their annotation vanished.     |
| `auto-close-held`   | Vanished annotations whose issue is being held pending more misses or more age. |
| `skipped`           | Create / update / reopen actions dropped because `max-issues` was exhausted.    |
| `total-annotations` | Total deduped annotations observed after severity filtering.                    |
| `json`              | Path to the JSON report file (always written via `mktemp`).                     |

## Permissions

```yaml
permissions:
  contents: read
  issues: write
```

`contents: read` is enough for the API calls into `actions/*` and
`checks/*`. `issues: write` is required for create / update / comment /
close. The workflow-provided `github.token` already has both when the
workflow declares them.
