# github-actions-annotations-reporter

A TypeScript/Node CLI **and** GitHub Action that scans the latest GitHub Actions
workflow runs for annotations (notice / warning / error), files **deduplicated**
GitHub Issues for them, and **auto-closes** issues when the underlying
annotation stops appearing.

It is built for the silent-drift problem: workflows keep going green, but
notices and warnings on those green runs pile up and nobody acts on them.
This tool turns each unique annotation into a tracked issue with severity
labels, respects history-aware suppression for "won't fix" closures, and
cleans up after itself when the noise actually goes away.

## Highlights

- **Scan scope:** latest completed run of each workflow on the configured
  branch (defaults to the repo's default branch).
- **Stable deduplication:** every annotation has a SHA-256 fingerprint over
  `(workflow file, annotation path, normalized message)`. Line numbers are
  intentionally excluded so a benign refactor never spawns a fresh issue.
- **Severity:** notice / warning / error each file an issue and get a
  matching `severity/<level>` label. Filter with `--min-severity`.
- **Won't-fix history:** closed prior issues are honored if any of these
  match — a configured label (default `wontfix`), the native `state_reason:
not_planned` closure, or a regex match against the closing comment.
- **Auto-close when vanished:** once an annotation stops appearing, the
  matching issue is auto-closed — but only after a configurable grace
  period (consecutive misses **and** age in days) and, by default, only
  when the workflow's latest run actually succeeded. A red CI run never
  triggers auto-close.
- **Idempotent:** persistent state (last-seen timestamp, miss counter,
  first-seen timestamp) lives in HTML-comment markers in the issue body.
  No external datastore.

## Use as a GitHub Action

```yaml
name: Annotation Reporter
on:
  workflow_dispatch:
  schedule:
    - cron: '17 6 * * *'

permissions:
  contents: read
  issues: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: ylabonte/github-actions-annotations-reporter@v1
        with:
          min-severity: warning
          auto-close-after-days: 7
          auto-close-after-misses: 3
```

See [`action.yml`](./action.yml) for the full input/output reference.

## Use as a CLI

```sh
# Dry-run scan against the current repo (resolved from git remote / GITHUB_REPOSITORY)
GITHUB_TOKEN=$(gh auth token) npx github-actions-annotations-reporter scan --dry-run

# Same scan, but also print every annotation with full detail (fielded blocks).
# Add --json to surface them as `annotations[]` inside the JSON report instead.
GITHUB_TOKEN=$(gh auth token) npx github-actions-annotations-reporter scan \
  --dry-run --list-annotations

# Apply: create/update/auto-close issues as needed
GITHUB_TOKEN=$(gh auth token) npx github-actions-annotations-reporter report \
  --repo owner/name \
  --min-severity warning \
  --json-out ./annotations-report.json
```

CLI commands:

| Command  | Description                                                          |
| -------- | -------------------------------------------------------------------- |
| `scan`   | Walk workflows + annotations and print the action plan (no writes).  |
| `report` | Same scan, then apply: create / update / reopen / auto-close issues. |
| `list`   | List currently-managed issues by management label.                   |

## How auto-close stays safe

A single missed scan is never enough. The decision requires **all** of:

1. The annotation's fingerprint was not seen in this scan.
2. The annotation's source workflow was actually within the scan filter
   (otherwise we don't have the data).
3. The workflow's latest run on the configured branch concluded
   `success` — unless you set `--no-auto-close-require-success`.
4. The miss counter (incremented per scan) has reached the configured
   threshold (default: 3).
5. The "last seen" timestamp is older than the configured grace period
   (default: 7 days).

The closing comment explains itself, the close uses `state_reason:
completed` (never `not_planned`, so it is distinct from user-driven
suppression), and if the annotation returns the same issue is **reopened**
rather than duplicated.

## License

MIT
