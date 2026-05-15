# Project memory — github-actions-annotations-reporter

## Project at a glance

- **Stack:** TypeScript ESM (NodeNext, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Node 20+, pnpm. Vitest + `@vitest/coverage-v8`. ESLint (strict-type-checked + unicorn) + Prettier. VitePress for docs. Changesets for releases.
- **Two surfaces:** a CLI (`ghaar`) and a composite GitHub Action. Both share the same domain core under `src/core/`.
- **Domain:** scan GitHub Actions workflow run annotations across the latest run per workflow, fingerprint them stably, file/update/reopen/auto-close issues based on history. The auto-close decision is guarded by miss counter + age window + (default) source-run-success.
- **Fingerprint:** sha256(`workflowPath \0 annotationPath \0 normalizedMessage`). Line numbers are intentionally NOT part of the preimage.
- **Persistence:** all state lives in HTML-comment markers in the issue body (`annot-id`, `annot-managed-by`, `annot-state`). No external datastore.
- **`dist/` is gitignored, npm-shipped:** the action runs via `npx -y -p github-actions-annotations-reporter@<version> ghaar`, so it pulls the published package (whose `files: ["dist", …]` ships `dist/`). Locally and in CI we rebuild via `pnpm build` whenever we need `dist/cli.js`. Don't commit `dist/`.

## Workflow rules (non-negotiable)

These came out of past sessions where things slipped through to CI. Follow them _every time_; they're cheap on the local machine and expensive when CI catches them.

### Before every commit

Run **all four**, in this order, and fix anything red before committing:

```bash
pnpm format:check   # prettier — easy to miss because `pnpm lint` does NOT cover it
pnpm lint
pnpm typecheck
pnpm test           # or pnpm test:coverage when the change touches src/
```

`pnpm format:check` is separate from `pnpm lint` and easy to forget when you've only edited markdown/docs. CI runs both — so do you.

**If the change touched `src/cli.ts`** (flags, descriptions, defaults), also run `pnpm docs:gen-cli` to regenerate `docs/reference/cli.md`, and commit the regenerated file alongside the source change. CI doesn't gate on this regen, so a miss ships silently. Run `node dist/cli.js --help` or `pnpm dev -- --help` as a final sanity-check on the prose the user actually sees.

When tests or lint fail mid-task, fix and re-run; do not commit "WIP" or "skip CI" unless the user explicitly asks for it. A commit that fails CI wastes a full matrix run.

### Use the task tracker

For any work that's more than a one-line change:

1. Call `TaskCreate` for each discrete step _before_ you start coding.
2. Mark `in_progress` when you pick it up.
3. Mark `completed` immediately when it's done — don't batch.
4. If you discover work mid-task, create new tasks rather than silently expanding scope.

This is what the user sees as progress; without it, the session feels opaque.

### Changesets — user-relevant only, and interactive

**Changesets exist for changes the user (= the npm/Action consumer) will notice or care about.** Examples that warrant an entry: new flags, behavior changes, bug fixes visible from the outside, breaking renames. Examples that do **not** warrant an entry, and should never end up in `CHANGELOG.md`: process / workflow / CLAUDE.md updates, internal refactors that preserve public behavior, test-only changes, lockfile bumps, dev-dependency upgrades, CI tweaks, formatting passes. When unsure, ask: "would this change appear in the changelog of any other npm package shipping the same fix?" — if not, no changeset.

When a change does warrant a changeset, **always ask the user before adding or modifying one** via `AskUserQuestion`, with the proposed entry body in the option `preview`. This is the same shape as commit confirmation:

- Question: `"Add (or extend) a changeset entry for this change?"`
- One option `Approve` whose `preview` is the full proposed Markdown — frontmatter (`'github-actions-annotations-reporter': major|minor|patch`) plus the body.
- One option `Alter` — when chosen, ask what to change, then re-issue.
- One option `Skip` — explicitly choose to ship the change with no changeset entry (the right call for non-user-visible work).
- One option `Cancel` — back out without committing the calling change either.

Don't create a `.changeset/*.md` file from Bash before this prompt has been approved.

### Code review mindset — every change

Treat every diff as if you're reviewing it for a PR with strict standards. Four lenses:

#### 1. Bugs

- Off-by-one, null handling, untested edge cases.
- Cross-platform paths (Windows uses `\`; we display POSIX). Use `path.relative` + `toPosixPath` (see `src/utils/paths.ts`) for any path shown to a human or test.
- Race conditions / shared mutable state across async paths.
- Partial-failure surfacing: a single annotation fetch erroring on one job should not blow up the whole scan — the collector should keep going and report what it could fetch.
- Deterministic tests: snapshot fixtures must not depend on `process.cwd()` or wall-clock time. Pass an explicit `now: Date` to time-sensitive code (the reconciler / auto-close policy already accept this).

#### 2. Optimizations

- Don't pull in heavy dependencies for trivial helpers; the project's existing utilities (`toPosixPath`, `globToRegex`, `normalizeMessage`) cover most cases.
- GitHub API calls go through `src/core/github/client.ts`. Tests mock at the Octokit boundary via `tests/helpers/fake-octokit.ts` — not at the HTTP layer. Preserve that pattern when adding new fetchers.
- Persistent state lives in the issue body via HTML comments (`annot-id`, `annot-state`). Don't introduce a side-channel cache, KV store, or workflow artifact — the in-body markers are the source of truth.

#### 3. Security — high priority

This tool reads GitHub data, writes issues, and runs inside Actions runners with workflow-provided tokens. Every change must be evaluated against these:

- **No shell.** Use `execFile`/`spawn` directly with an args array — never `exec`, never `spawn(cmd, { shell: true })` with non-constant input.
- **No command injection via configuration.** Workflow names, glob patterns, label names, and regex patterns are all attacker-controllable in malicious repos. Never interpolate them into a shell command, env var name, URL position, or filesystem path.
- **No prototype pollution.** When parsing user input (configs, issue bodies, annotations), prefer `Map` over plain objects, or use `Object.create(null)`. Never `Object.assign` a parsed object onto a config object.
- **No regex DoS.** Any new regex applied to user input must be linear-time. The `wontfix.commentPattern` is the highest-risk surface — it's compiled from user config and run against arbitrary issue comments. Caps are enforced in `src/core/wontfix-detector.ts`: `MAX_PATTERN_LENGTH = 1000` (oversized patterns are rejected, treated as non-match) and `MAX_COMMENT_LENGTH = 64 * 1024` (the comment is truncated before regex evaluation, bounding worst-case cost). Invalid regex is fail-safe (no match). Preserve all three guarantees when changing the detector.
- **Credentials hygiene.** GitHub tokens come through `GITHUB_TOKEN` / `GH_TOKEN` env vars or `gh auth token`. Never log, never write to disk, never pass beyond the in-memory `Octokit` instance. The `resolveAuth` chain (`src/core/auth.ts`) is the only legitimate token-handling code.
- **Supply chain.** When bumping a dependency, check the GitHub Dependabot tab on the remote afterward — moderate advisories should land as `pnpm.overrides` entries before merging.
- **`action.yml` composite-action security.** All inputs reach the bash dispatcher through `env:` blocks (never inline `${{ }}` in `run:`), then onto an `args=()` array so npx receives them as separate argv entries without shell re-parsing. The `version` input is allowlist-validated (`^[A-Za-z0-9][A-Za-z0-9._+-]*$`) before reaching `npx` — this prevents tarball/git-URL/alias forms that would resolve to arbitrary code.
- **Workflow injection in our own CI.** The project's own `.github/workflows/*.yml` must not interpolate `${{ github.event.* }}` into `run:` commands directly — use `env:` blocks with quoted shell variables. See the GitHub Security blog post on workflow injection.

If you find a security issue while making an unrelated change, flag it to the user immediately. Don't silently fix and move on; the user wants to know.

#### 4. Documentation surfaces

The single most-flagged class of issue in our PR reviews is doc/code drift — prose that described a previous version of the implementation. Anything visible at a user-facing contract boundary lives in **multiple files**, and a code change that doesn't carry the matching prose along is incomplete. When you touch a CLI flag, an Action input/output, an exit code, the JSON report schema, or the issue body format, walk every place the contract is named and update them in the same commit:

- The implementation itself — `src/` for the CLI, the `run:` script in `action.yml` for the Action.
- The matching `description:` field in `action.yml` (`inputs:` / `outputs:`).
- The matching row in **`README.md`** tables and prose.
- The matching paragraph(s) in **`docs/guide/`** — usually `use-as-action.md`, `quickstart.md`, `how-it-works.md`, or `config-file.md`.
- **The CLI's own self-documentation.** A change in `src/cli.ts` propagates into three additional surfaces:
  - **commander's `--help` output**, which the CLI emits at runtime. Sanity-check with `pnpm dev -- --help` or `node dist/cli.js --help` after any flag, description, or default change — a stray typo here ships verbatim to every user.
  - **`docs/reference/cli.md`**, auto-generated from commander via `pnpm docs:gen-cli`. Regenerate after any change to `src/cli.ts`; commit the regenerated file. CI doesn't check that the generated reference is up-to-date, so a missed regen rides quietly into a release.
  - **Runnable example snippets** in `README.md` and `docs/guide/quickstart.md`. These drift silently when flags rename or new ones appear; re-read them whenever you touch the corresponding option.
- The JSON report schema in `docs/reference/json-output.md` whenever `JsonReport` / `SerializedAction` in `src/io/output/json.ts` changes shape. Bump `schemaVersion` for breaking changes.
- The issue body layout in `docs/reference/issue-format.md` whenever the markers in `src/io/issue-body.ts` change.
- Any open **`.changeset/*.md`** entry that bundles this change.

Before committing a contract-touching change, `grep -n` the identifier (flag name, input name, output name, behavior phrase) across the repo. If it's named in three files but updated in only one, you have doc drift in flight. CI will not catch this; the next reviewer will.

**Doc surfaces drift in both directions.** Code can move while prose goes stale (code → docs drift); docs can describe a feature the code doesn't yet ship (docs → code drift). When you add a feature, walk the docs that _already_ describe it and reconcile. When you remove one, walk the docs that _still_ describe it.

## Project conventions

### Fingerprint rules

- **Preimage:** `sha256(workflowPath \0 annotationPath \0 normalizeMessage(message))`. The literal byte sequence is `workflow path`, NUL byte, `annotation path`, NUL byte, normalized message.
- **`normalizeMessage` collapses:** trailing whitespace per line, CRLF→LF, leading/trailing blank lines. Same logical message across CRLF/LF or trailing-space differences hashes the same.
- **Line numbers are not in the preimage.** A benign refactor that shifts a deprecation from line 10 to line 200 must hash the same. Tests guard this — see `tests/unit/core/fingerprint.test.ts`.
- **Workflow path matters.** Two workflows emitting the same annotation message produce two distinct fingerprints. This is intentional: a notice that hits both `ci.yml` and `release.yml` is two separate things to track.

### CLI exit codes

| Code | When                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| `0`  | The pipeline ran. By default, finding/filing/updating issues exits 0.                |
| `1`  | An error during the run (auth failure, repo resolution failure, GitHub API failure). |
| `2`  | `--fail-on-new` was set and the run created at least one new issue.                  |

Don't change these without bumping the schema in `docs/reference/cli.md` and adding a changeset.

### Color & display

- `picocolors` for color (no chalk; we keep the dep tree tiny).
- `cli-table3` for the action table; border chars are explicit so the table is consistent across terminals.
- Display paths are always POSIX-normalized via `src/utils/paths.ts::toPosixPath`. Absolute paths used for `fs` calls stay native.
- The `report` summary line uses bare color helpers (`pc.green`, `pc.yellow`, `pc.red`) — keep severity → color stable so users can scan output without a key.

### Testing

- Unit tests in `tests/unit/`; mirrors `src/`.
- Mock at the Octokit boundary via `makeFakeOctokit` in `tests/helpers/fake-octokit.ts` — not at the HTTP layer. New API calls should be added to the fake before they're added to the production wrapper.
- Time-sensitive code (reconciler, auto-close policy) accepts an injected `now: Date`. Use a fixed date in tests, not `new Date()`.
- Coverage thresholds: lines/functions/statements at 90 %, branches at 85 % (vitest 4 counts branches more granularly than v2 did). The `cli.ts` and `commands/*.ts` files are excluded from coverage — they are thin glue exercised end-to-end via the pipeline tests.
- Use `c8 ignore` sparingly — only for genuine system-boundary code (the `defaultGhAuthToken` subprocess, the CLI's `parseAsync` invocation).

### Git hygiene

- Logical, atomic commits. One concern per commit.
- Conventional commit prefixes: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`. Add `!` for breaking (`feat(cli)!:`).
- Body explains _why_, not what — the diff already says what.
- Never `--no-verify`, never `--force` without explicit user authorization.

### Confirm before externally-visible actions — always, via `AskUserQuestion`

Even in auto/yolo mode, any action that's visible to others or hard to fully undo must be confirmed by the user via `AskUserQuestion`, with the full content of the action rendered in an option `preview`. Plain Y/N harness prompts via `permissions.ask` are explicitly removed — the rich preview is the whole point.

The rule applies to:

- `git commit` — preview is the commit message you're about to use.
- `git push` — preview is the list of commits leaving the local machine.
- `gh pr create` — preview is the **PR title plus the full body**.
- `gh pr edit` — preview is the resulting title/body (the new state, not the diff).
- `gh pr comment`, `gh pr review` — preview is the comment / review body.
- **Replying to a PR review comment or discussion thread** — preview is the reply body. When responding to multiple inline comments from the same review, **batch all the replies into a single prompt** whose preview lists every reply with its target file:line header.
- **Resolving / unresolving a PR review thread** — `Approve` / `Cancel`. Batch with the matching replies.
- `gh pr merge`, `gh pr close`, `gh pr reopen` — preview is a short statement of which PR changes state and how. No `Alter` option.
- `gh issue create` / `edit` / `comment` / `close` / `reopen` — same shape as PR.
- Adding or modifying a `.changeset/*.md` file — see the "Changesets" section above.
- Anything posting to a third-party service (Slack, gist, paste, registry).

**Shape of the prompt:**

| Action kind                | Option set                                          | Preview content                                                          |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Commit                     | `Approve` / `Alter the message` / `Cancel`          | Full commit message.                                                     |
| Push                       | `Approve` / `Cancel`                                | `git log @{upstream}..HEAD --oneline --decorate`.                        |
| PR create                  | `Approve` / `Alter title` / `Alter body` / `Cancel` | `<title>\n\n<full body>`.                                                |
| PR edit / comment / review | `Approve` / `Alter the body` / `Cancel`             | The new title+body or comment body.                                      |
| PR review reply (batch)    | `Approve` / `Alter` / `Cancel`                      | Every reply body in the batch, each prefixed with `── <file>:<line> ──`. |
| PR / issue state change    | `Approve` / `Cancel`                                | One-line statement (`#42 → closed`).                                     |
| Thread resolve (batch)     | `Approve` / `Cancel`                                | List of `<file>:<line>` threads being resolved.                          |
| Changeset add / edit       | `Approve` / `Alter` / `Skip` / `Cancel`             | Full proposed `.changeset/*.md` content.                                 |

When the user picks `Alter ...`, follow up by asking what to change, then re-issue the same question with the revised preview. **Never** execute the underlying command before this prompt has been approved.

## Common pitfalls (we've hit these)

- **Machine-dependent snapshots.** Always pin `cwd` and `now: Date` in renderer / pipeline tests.
- **`path.relative` on Windows yields backslashes.** Normalize with `toPosixPath` before display/test assertions.
- **`spawn` of `.cmd` shims on Windows fails without `shell: true`.** Restrict `shell: true` to a branch where every arg is a static test string.
- **Vitest 4 dropped `coverage.all`.** Don't reintroduce it.
- **pnpm 11 requires explicit build approval.** See `pnpm-workspace.yaml`'s `allowBuilds` entry.
- **`process.stdin.isTTY` is ambient.** Tests that depend on it pass under vitest but fail under `pnpm test:watch` from a real terminal. Force `isTTY` explicitly with `Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: <bool> })` + a `try/finally` restore.
- **Composite Action input defaults are literal strings.** `default: ${{ github.token }}` is the literal string, not the token. We use empty defaults + an expression fallback in the `env:` block — see `action.yml`'s `GITHUB_TOKEN` handling.
- **`set -euo pipefail` + pipe + downstream tool that may exit non-zero.** A failing CLI in `cli | tee out` kills the script before subsequent commands run. Wrap with `set +e` → `cli | tee out` → `captured=${PIPESTATUS[0]}` → `set -e`, write outputs, end with `exit "$captured"`.
- **`jq` itself fails on empty/unparseable JSON.** `// 0` inside the filter doesn't cover this — `jq` exits non-zero before the filter even runs. Combine `// 0` with `2>/dev/null || echo 0` outside to stay robust under both modes.
- **Fixed `$RUNNER_TEMP/<name>.json` collides under multi-use.** Two invocations of the same composite action in one job overwrite each other's reports. Use `mktemp "$RUNNER_TEMP/<name>.XXXXXXXX.json"` and surface the per-invocation path as the output. `action.yml` already does this.
- **`extra=($VAR)` enables pathname expansion in bash.** Globs in `$VAR` expand against the workspace before reaching the next stage. Use `read -r -a extra <<<"$VAR"` instead, then guard `(( ${#extra[@]} > 0 ))` because whitespace-only input parses to a zero-length array and a bare `--flag` with no values silently eats the next argument.
- **npm package specs accept more than semver.** `npm install foo@<spec>` parses `<spec>` against a wide grammar — tarball URLs, git URLs, file paths, alias forms (`npm:other-pkg@...`) — all of which override the package name and execute arbitrary code. Validate any user-controlled `<spec>` against a tight allowlist (e.g. `^[A-Za-z0-9][A-Za-z0-9._+-]*$`) before passing to `npx`. `action.yml` already does this.
- **VitePress and `${{ ... }}`.** Vue interpolates double-curly mustaches even inside markdown. Don't write literal `${{ github.token }}` in prose or table cells — use a workaround like `workflow \`github.token\``or wrap in`<span v-pre>`. Fenced code blocks are safe (auto v-pre).
- **`closed_by` is `null` for issues closed by GitHub Apps or via the API.** The `getClosingComment` fallback (any comment ≤ `closed_at`) handles this. Don't tighten the predicate without considering the fallback case.
- **CI environment leaks into tests.** GitHub Actions runners auto-set `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, `GITHUB_ACTIONS`, `RUNNER_TEMP`, `process.stderr.isTTY`, etc. Tests that read these (directly or via the code under test) pass locally and fail in CI, or vice versa. Stub explicitly with `vi.stubEnv(name, '')` + `vi.unstubAllEnvs()` in a try/finally — see `tests/unit/core/pipeline.test.ts` "throws when the repository cannot be determined". The CLI/command glue (`src/cli.ts`, `src/commands/*.ts`) is excluded from coverage so it never has to be exercised under these conditions in unit tests.

## Useful commands

```bash
pnpm dev                 # run the CLI from source
pnpm dev -- scan --dry-run --json
pnpm test                # full suite
pnpm test:coverage       # with thresholds
pnpm build               # produce dist/cli.js
pnpm docs:dev            # local docs preview
pnpm docs:gen-cli        # regenerate the CLI reference from commander
pnpm docs:build          # build the VitePress site (also runs docs:gen-cli)
pnpm changeset           # add an entry (only when user approves)
```

## When in doubt

Ask. The user prefers a short clarifying question over a guess-and-revert cycle. But also: keep questions decisive (multiple-choice over open-ended) and respect their time — don't ask three when one would do.
