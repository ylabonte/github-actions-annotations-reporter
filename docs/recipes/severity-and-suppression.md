# Severity & suppression

## Severity filtering

Each annotation files an issue tagged with one of:

- `severity/notice` — informational (linter notes, deprecation hints).
- `severity/warning` — should probably be looked at.
- `severity/error` — runner-classified failures.

To skip notices entirely:

```bash
ghaar report --min-severity warning
```

In a config file:

```yaml
minSeverity: warning
```

When the same fingerprint is observed at multiple severities across
jobs, the highest wins for the representative annotation and the issue
gets labeled accordingly. If a previously-warning annotation escalates
to error in a later run, the management label rotation drops
`severity/warning` and adds `severity/error` on the next `update`.

## Won't-fix via label

The simplest pattern: close the issue and add the `wontfix` label.

```bash
gh issue close 42 --reason completed
gh issue edit 42 --add-label wontfix
```

The next time the same annotation surfaces, the detector skips it and
reports `suppressed`. The original issue stays closed.

You can configure additional labels:

```yaml
wontfix:
  labels: [wontfix, accepted-noise, not-our-problem]
```

Any one of these on the closed issue suppresses re-filing.

## Won't-fix via `state_reason: not_planned`

GitHub's native "Close as not planned" sets `state_reason: not_planned`
on the issue. The detector treats this as suppression by default:

```bash
gh issue close 42 --reason "not planned"
```

To opt out:

```yaml
wontfix:
  respectStateReason: false
```

## Won't-fix via closing-comment regex

For free-form suppression — e.g. "I'm leaving this until we upgrade Foo
in Q3" — match a regex against the closing comment:

```yaml
wontfix:
  commentPattern: '(?i)leaving (this )?until|accepted for now'
```

The detector fetches the issue's timeline once and picks the last
comment authored by the closer at or before `closed_at`. Invalid
regexes are treated as non-matches (fail-safe).

A leading PCRE-style inline-flag group is translated into JavaScript
`RegExp` flags. So you can write `(?i)wontfix` for a case-insensitive
match instead of expanding to `[Ww][Oo][Nn][Tt][Ff][Ii][Xx]`. The
supported flag characters are `i`, `m`, `s`, `u`, `y`.

## Re-opening when an annotation returns

A previously-closed issue without any suppression signal is **reopened**
the next time the same annotation appears — no duplicate is created.
The miss counter resets to zero and the auto-close clock restarts.

This is the round-trip:

```
annotation appears → create
annotation persists → update (each run)
annotation vanishes → hold, hold, hold → auto-close
annotation returns → reopen (same issue, same number)
```

## Combining signals

All three won't-fix signals are checked in this order: label →
state_reason → comment-pattern. The first match wins, and the JSON
report records which signal matched so you can audit your noise budget.

Recommended starter setup for noisy repos:

```yaml
wontfix:
  labels: [wontfix, accepted-noise]
  respectStateReason: true
  commentPattern: '(?i)wont ?fix|accept(ed)?'
```

## Auditing what the scan actually saw

Use `--list-annotations` to print every annotation with its full payload
(message, raw details, file & line, run URL, fingerprint, head SHA, …):

```bash
ghaar scan --dry-run --list-annotations
```

Combined with `--json`, the same data is added to the report under
`annotations[]`. See the [JSON output](../reference/json-output) reference
for the schema.
