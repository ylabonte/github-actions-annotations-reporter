# Issue format

Every managed issue carries persistent state in HTML-comment markers so
the tool stays idempotent without an external datastore.

## Body layout

```markdown
<!-- annot-id: sha256:<64-hex> -->
<!-- annot-managed-by: github-actions-annotations-reporter -->
<!-- annot-state: {"lastSeenAt":"…","missCounter":0,"firstSeenAt":"…","workflowPath":"…"} -->

**Severity:** warning
**Workflow:** `.github/workflows/ci.yml` → job `lint`
**File:** `src/foo.ts` (line 42)

> Deprecated API: `foo()` is removed in v3. Migrate to `bar()`.

### Recent occurrences

- 2026-05-15 — [run #1234](https://github.com/ylabonte/demo/actions/runs/1234)
- 2026-05-14 — [run #1233](https://github.com/ylabonte/demo/actions/runs/1233)

---

_Filed by github-actions-annotations-reporter. Close with a configured
"won't fix" label or "Close as not planned" to suppress future filings.
Will be auto-closed once the annotation stops appearing for the
configured grace period._
```

## Markers

### `annot-id`

The fingerprint, lowercase hex. **Lookup key** for the prior-issue
index. Format: `sha256:` prefix + 64 hex characters.

If a body lacks this marker, the tool treats it as unmanaged, no matter
what labels it carries. This is the safety valve: a user can edit the
marker out of an issue to "release" it from automation entirely.

### `annot-managed-by`

A constant string identifying the tool. Informational; not used for
lookup.

### `annot-state`

A JSON blob with the persisted state:

| Key            | Type            | Meaning                                                                                                                         |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `lastSeenAt`   | ISO-8601 string | When the annotation was last observed. Reset on every `update` or `reopen`.                                                     |
| `missCounter`  | integer ≥ 0     | Consecutive scans the annotation has been absent. Incremented in the vanish pass; reset to 0 on `update` / `reopen`.            |
| `firstSeenAt`  | ISO-8601 string | When the issue was first filed. Never changes.                                                                                  |
| `workflowPath` | string          | The source workflow's repo-relative path. Used by the vanish pass to decide whether the source workflow was in scope this scan. |

If a managed issue has no `annot-state` marker (e.g. legacy issues from
an earlier version), the auto-close policy treats it as
"infinitely old", so it becomes eligible for close based on misses
alone.

## Title

```
[Warning] src/foo.ts: Deprecated API: `foo()` is removed in v3. Migrate to `bar()`.
```

Format: `[<Severity>] <path>: <message>`. The message is the
annotation's `title` if provided, otherwise its `message` collapsed to
a single line. Long titles are truncated to 100 characters with `…`.

## Labels

Every managed issue carries the management label (default
`automation/annotation-reporter`) plus exactly one severity label
(`severity/notice|warning|error`). When the severity escalates, the
update step swaps the severity label without touching other labels you
or your team may have added (e.g. `triage/needed`).

## Editing rules

Things you _can_ safely change on a managed issue:

- Title.
- Body prose outside the markers and the "Recent occurrences" section.
- Any label other than `automation/annotation-reporter`.
- Closing it (with or without a won't-fix signal).

Things you _shouldn't_ change:

- The three HTML-comment markers — the tool depends on their format
  for lookup and state.
- The `automation/annotation-reporter` label — removing it un-manages
  the issue.

The "Recent occurrences" list is rewritten on every `update` /
`reopen`, so any edits there are lost on the next touch.
