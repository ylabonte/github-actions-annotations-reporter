# Quickstart

This page gets you from zero to a first scan in under five minutes.

## Install

The CLI ships on npm. Pick whichever fits your workflow:

```bash
# global install (one-time)
npm install -g github-actions-annotations-reporter

# pnpm
pnpm add -g github-actions-annotations-reporter

# ephemeral run (no install)
npx github-actions-annotations-reporter --help
```

If you only ever invoke it from GitHub Actions, you don't need to install
anything — the action wrapper calls `npx` for you. Jump to
[Use as a GitHub Action](./use-as-action).

## Resolve the target repo

`ghaar` needs to know which `<owner>/<repo>` to scan. It tries three
sources in order, and the first one that resolves wins:

1. `--repo owner/name` (explicit flag).
2. `GITHUB_REPOSITORY` env var (set automatically inside GitHub Actions
   runners).
3. `git remote get-url origin` from the current working directory.

The third step means that when you run `ghaar` from inside a cloned
GitHub repo, no flag is needed — the CLI parses the local `origin` URL
(SSH or HTTPS, with or without credentials) and emits a one-line
"Resolved repo … from local git remote 'origin'" notice on stderr so you
can verify the inferred target. Non-GitHub remotes (GitLab, Bitbucket,
self-hosted GitHub Enterprise Server) are ignored — pass `--repo`
explicitly for those.

## Provide a token

`ghaar` reads workflow runs and writes issues, so it needs a GitHub token.
The token resolution chain is:

1. `--token <value>` (explicit flag)
2. `GITHUB_TOKEN` or `GH_TOKEN` env var
3. `gh auth token` (the GitHub CLI's own session)
4. Anonymous (rate-limited; cannot write issues)

For local use, the easiest path is:

```bash
export GITHUB_TOKEN="$(gh auth token)"
```

See [Authentication](./authentication) for required scopes and Action-only
notes.

## First scan

The `scan` command never writes anything — it's read-only by design. It
walks your workflows, fetches the latest run on the default branch for
each one, and prints the action plan it _would_ apply:

```bash
ghaar scan
```

(There's no `--dry-run` on `scan` because it never writes; that flag is
only meaningful for `report`, where it's the opt-out switch.)

You'll see a table with one row per planned action — `create`, `update`,
`reopen`, `suppressed`, `auto-close`, `auto-close-hold` — and a summary
line. The reasoning for each row appears in the `Reason` column.

If you want the same data in machine-readable form:

```bash
ghaar scan --json > report.json
```

The JSON schema is documented in [JSON output](../reference/json-output).

To see every annotation with its full payload (message, raw details, run
URL, fingerprint, head SHA, …) — either as fielded blocks on stdout or as
an `annotations[]` array in the JSON — add `--list-annotations`:

```bash
ghaar scan --list-annotations
ghaar scan --list-annotations --json > report.json
```

## Progress indicators

On an interactive terminal, `ghaar` renders a spinner with phase-by-phase
progress on stderr — repository resolution, workflow scan, issue load,
reconcile, and (in `report` mode) the apply loop. Progress is auto-disabled
in non-TTY environments (CI, redirected output, `--json` mode), so it
never pollutes a pipe or a GitHub Actions log. Force it off explicitly with
`--no-progress`.

## First report (apply)

When you're ready to actually file issues, use `report`:

```bash
ghaar report
```

On the first run this will:

- Create the management label (`automation/annotation-reporter`) and
  severity labels (`severity/notice|warning|error`) if they don't already
  exist.
- File a new issue for every distinct annotation, with a stable
  fingerprint marker in the body.
- Skip any annotations whose prior issue was suppressed (matching label,
  `state_reason: not_planned`, or a configured closing-comment regex).

Subsequent runs are idempotent: re-running with no annotation changes
produces zero writes.

## What's next

- [How it works](./how-it-works) — the pipeline, fingerprinting, and
  auto-close decision tree.
- [Use as a GitHub Action](./use-as-action) — the action wrapper's inputs
  and outputs.
- [Config file](./config-file) — defaults, schema, search paths.
- [Severity & suppression](../recipes/severity-and-suppression) — common
  patterns for managing noise.
