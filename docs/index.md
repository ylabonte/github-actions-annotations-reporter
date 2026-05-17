---
layout: home

hero:
  name: github-actions-annotations-reporter
  text: Stop ignoring your green-run annotations.
  tagline: Turn workflow notices, warnings, and errors into tracked GitHub Issues — deduplicated, severity-labeled, history-aware, and auto-closed when the noise stops.
  actions:
    - theme: brand
      text: Get started
      link: /guide/quickstart
    - theme: alt
      text: CLI reference
      link: /reference/cli

features:
  - title: Stable fingerprinting
    details: '`sha256(workflowPath + annotationPath + normalizedMessage)` — line numbers are deliberately excluded so a benign refactor never spawns a duplicate issue.'
  - title: Severity-aware
    details: Every annotation files an issue tagged with `severity/notice|warning|error`. Filter with `--min-severity` or escalate via config.
  - title: History-aware suppression
    details: 'Closed prior issues can suppress future filings via any of three signals: a configured label (default `wontfix`), `state_reason: not_planned`, or a regex on the closing comment.'
  - title: Auto-close, safely
    details: When an annotation stops appearing, the matching issue is auto-closed — but only after a configurable miss-counter + age grace period, and (by default) only when the source workflow's latest run actually succeeded.
  - title: Idempotent state in-body
    details: Persisted last-seen, miss counter, and first-seen timestamps live in HTML comments inside the issue body. No external datastore.
  - title: Tested above 90%
    details: 190+ unit tests, strict TypeScript, hardened composite-action bash dispatcher. CI runs on Node 22 across Linux, macOS, and Windows.
---

## Install

```bash
# global
npm install -g github-actions-annotations-reporter

# or with pnpm
pnpm add -g github-actions-annotations-reporter

# or ephemeral
npx github-actions-annotations-reporter
```

## 30-second demo

```bash
# Dry-run: see what would change, don't write anything
ghaar scan --dry-run

# Apply: create / update / reopen / auto-close issues as needed
ghaar report

# List currently-managed issues
ghaar list
```

## Use as a GitHub Action

```yaml
- uses: ylabonte/github-actions-annotations-reporter@v1
  with:
    min-severity: warning
    auto-close-after-days: 7
    auto-close-after-misses: 3
```

See the [use-as-action guide](/guide/use-as-action) for the full input/output reference.
