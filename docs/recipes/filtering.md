# Filtering workflows

By default `ghaar` scans every workflow returned by the GitHub Actions
API. Two patterns trim that down.

## `workflows` — include only matching

Whitespace-separated globs, matched against:

- the workflow's display name (e.g. `CI`),
- its repo-relative path (e.g. `.github/workflows/ci.yml`),
- and the basename of that path (e.g. `ci.yml`).

```bash
ghaar report --workflows ci.yml release.*
```

In a config file:

```yaml
workflows:
  - 'ci.yml'
  - 'release.*'
  - 'CI'
```

Glob syntax is intentionally minimal: `*` matches any non-slash run,
`**` matches across slashes, `?` matches a single non-slash character.
No braces, no character classes — keep your patterns readable.

## `reject` — exclude matching

Same matching rules, but the workflow drops out of the scan when **any**
include is matched. Exclude wins on conflict.

```bash
ghaar report --reject 'preview-*' 'docs-*'
```

```yaml
reject:
  - 'preview-*'
  - 'docs-*'
```

## Monorepo tip

If your monorepo runs many parallel CI workflows that all emit the same
linter notices (e.g. `pnpm-workspace-lint.yml` × 30 packages), filter
down to the root-level integration workflow and let the
per-package workflows' annotations be ignored:

```yaml
workflows: ['integration.yml', 'release.yml']
```

The dedupe also handles this case if you _don't_ filter — the same
`(workflowPath, annotationPath, message)` triple from 30 workflows
produces 30 distinct fingerprints, but each file-touching message is
unique to one workflow's run, so you end up with one issue per
notice-bearing workflow, not 30. Still, filtering is cheaper.

## Combined with `min-severity`

Filters compose. A common production setup:

```yaml
workflows: ['ci.yml']
reject: []
minSeverity: warning
```

Only the main CI workflow, only warnings and errors. Quietest, most
signal-dense flavor.
