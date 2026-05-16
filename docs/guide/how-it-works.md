# How it works

`ghaar` is built around the silent-drift problem: workflows keep going
green, but warnings and notices on those green runs pile up and nobody
acts on them. The tool turns each distinct annotation into a tracked
GitHub Issue, then cleans up after itself when the annotation goes away.

## The pipeline

```
resolveContext
    └─► collectAnnotations    (latest run per workflow → jobs → check-run annotations)
            └─► fingerprint
                    └─► reconcile      (annotation × prior-issue matrix)
                            └─► vanish pass   (open managed issue NOT seen this run)
                                    └─► apply (create / update / reopen / close / comment)
```

### 1. Resolve context

The tool determines the target repository (from `--repo`, `GITHUB_REPOSITORY`,
or a git remote), the branch (`--branch` or the repo's default branch),
and a token from the [auth chain](./authentication). Configuration from
your config file is merged with CLI flags — flags win.

### 2. Collect annotations

For each workflow in `.github/workflows/` that matches the include/exclude
globs:

- Fetch the latest **completed** run on the target branch.
- List all jobs for that run.
- For each job, fetch the check-run's annotations via the GitHub API.

Annotations below `--min-severity` are dropped here. The result is
deduped by fingerprint (within a single scan): same fingerprint → one
representative, picked by highest severity then most recent run.

### 3. Fingerprint

Every annotation gets a stable identifier:

```
sha256( workflowPath \0 annotationPath \0 normalizeMessage(message) )
```

`normalizeMessage` strips trailing whitespace per line, normalizes CRLF
to LF, and trims leading/trailing blank lines. **Line numbers are
intentionally NOT part of the preimage** — a benign refactor that moves
a deprecation by 50 lines must not spawn a duplicate issue.

### 4. Reconcile

For each annotation seen this scan, look up its fingerprint in the prior
issue index (built from issues carrying the management label):

| Prior issue state                | Action                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| _none_                           | `create`                                                                |
| open                             | `update` (refresh body, occurrences, severity label, last-seen, miss=0) |
| closed, matches won't-fix signal | `suppressed` (no write)                                                 |
| closed, no signal                | `reopen`                                                                |

The "won't-fix signals" are configurable and checked in order:

1. The closed issue carries any configured label (default `wontfix`).
2. The closure used `state_reason: not_planned` (and the option is enabled).
3. The closing comment matches a configured regex.

### 5. Vanish pass

After the reconcile loop, walk every **managed open issue** whose
fingerprint was _not_ seen this scan. These are candidates for
auto-close. The decision is gated by:

- The issue's source workflow must be inside the include/exclude scope
  of this scan (otherwise we don't have enough information).
- `auto-close-require-success` (default `true`): the workflow's latest
  run on the target branch must have concluded `success`. A red CI run
  may legitimately omit annotations, so we refuse to act on it.
- The persisted miss counter must reach `auto-close-after-misses`
  (default `3`).
- The persisted last-seen timestamp must be older than
  `auto-close-after-days` (default `7`).

When all conditions are met, the issue is closed with `state_reason:
completed` and a closing comment that explains itself. If only some
conditions are met, the miss counter is incremented and the issue is
"held" until the next scan. If the annotation reappears before close,
the counter is reset to zero.

### 6. Apply

Real writes happen only in `report` mode (not `scan`) and only when
`--dry-run` is absent. The `--max-issues` cap applies to create / update
/ reopen — auto-close is never throttled because it's cleanup, not load.

## State lives in the issue body

There is no external datastore. Every managed issue's body contains:

```html
<!-- annot-id: sha256:<64-hex> -->
<!-- annot-managed-by: github-actions-annotations-reporter -->
<!-- annot-state: {"lastSeenAt":"…","missCounter":0,"firstSeenAt":"…","workflowPath":"…"} -->
```

The fingerprint marker drives lookup; the state marker drives the auto-close
gate. Both are rewritten on every touch. Full layout in
[Issue format](../reference/issue-format).

## Idempotency

Running `report` twice in a row with no annotation changes:

- `new-issues: 0`
- `updated-issues: 0` _or_ the same number with no body changes (the
  "Recent occurrences" list deduplicates by run number, so re-seeing the
  same run is a no-op).
- `suppressed`, `auto-closed`, and `auto-close-held` unchanged.

The action wrapper writes the JSON report to `mktemp` so multiple uses
in one job don't clobber each other's `json` output.
