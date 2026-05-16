---
'github-actions-annotations-reporter': major
---

Initial stable release. `github-actions-annotations-reporter` ships as both a TypeScript/Node CLI (`ghaar`) and a composite GitHub Action sharing one domain core. It scans GitHub Actions workflow annotations across the latest run of each workflow, files deduplicated GitHub Issues for them, and auto-closes those issues when the underlying annotations stop appearing.

### What's in the box

- **CLI & Action.** A single `ghaar` binary plus a composite Action wrapper that installs the package on demand and forwards every flag. Node 20+, ESM-strict, pnpm-managed.
- **Annotation scanning.** Walks every workflow on the configured branch, picks the latest completed run of each, and collects `notice` / `warning` / `error` annotations. Severity filtering via `--min-severity` and glob include/exclude (`--workflows`, `--reject`).
- **Stable fingerprinting.** Each annotation is identified by `sha256(workflowPath + annotationPath + normalizedMessage)`. Line numbers are deliberately excluded so a benign refactor that shifts a deprecation from line 10 to line 200 never spawns a fresh issue.
- **Idempotent issue lifecycle.** Reconciler decides per fingerprint whether to create, update, reopen, suppress, auto-close, or hold. State (last-seen timestamp, miss counter, first-seen timestamp) lives in HTML-comment markers embedded in the issue body — no external datastore.
- **Won't-fix history.** Three signals suppress future filings of a previously closed issue: a configured label (default `wontfix`), the native `state_reason: not_planned` closure, or a regex match against the closing comment. Regex evaluation is bounded (`MAX_PATTERN_LENGTH = 1000`, `MAX_COMMENT_LENGTH = 64 KB`) to defeat ReDoS.
- **Safe auto-close.** When an annotation stops appearing, the corresponding issue is auto-closed only after **all** of: the source workflow's run concluded `success` (default; opt-out with `--no-auto-close-require-success`), the miss counter cleared the threshold (default 3 scans), and the last-seen timestamp aged out (default 7 days).
- **Repository auto-detect.** Three-step resolution: `--repo owner/name` → `GITHUB_REPOSITORY` → `git remote get-url origin`. Running `ghaar scan` from inside a cloned GitHub repo works with no flags; the CLI emits a one-line stderr notice so the inferred target is visible. Non-GitHub remotes (GitLab, Bitbucket, GitHub Enterprise Server) are ignored.
- **Auth chain.** `--token` → `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token` → anonymous (rate-limited, no writes).
- **Outputs.** Human-readable action table on stdout, JSON report (`--json` / `--json-out <path>`) with stable `schemaVersion: 1`, optional `--list-annotations` block for full per-annotation detail, plus 9 documented Action outputs (`new-issues`, `updated-issues`, `reopened-issues`, `suppressed`, `auto-closed`, `auto-close-held`, `skipped`, `total-annotations`, `json`).
- **CLI exit codes.** `0` success, `1` runtime error, `2` `--fail-on-new` was set and at least one new issue was created — usable directly in PR gates.
- **Hardened composite Action.** Inputs reach the dispatcher through `env:` blocks (never inline `${{ }}` in `run:`), then onto an `args=()` array so npx receives them as separate argv entries without shell re-parsing. The `version` input is allowlist-validated (`^[A-Za-z0-9][A-Za-z0-9._+-]*$`) before reaching `npx`. `set -euo pipefail` paired with PIPESTATUS-aware error capture so a downstream `tee` or `jq` failure never masks the CLI's real exit code.
- **Docs site.** Full guide, recipes, and reference at <https://ylabonte.github.io/github-actions-annotations-reporter/>.
