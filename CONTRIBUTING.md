# Contributing

Thanks for your interest! `github-actions-annotations-reporter` is a small,
focused project with a clear scope; that constraint is intentional — it keeps
the surface area testable and the failure modes predictable.

## Prerequisites

- Node **20+**
- pnpm **10.16+** (pinned via `packageManager` in `package.json`)

## Setup

```bash
pnpm install
pnpm build
pnpm test:coverage
```

## Development loop

```bash
pnpm dev -- scan --dry-run --json           # run the CLI from source
pnpm test:watch                             # tests in watch mode
pnpm lint                                   # eslint
pnpm typecheck                              # tsc --noEmit
pnpm docs:dev                               # local docs preview
```

## Code quality bar

- All code is TypeScript with `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- ESLint with `@typescript-eslint/strict-type-checked` and `eslint-plugin-unicorn`.
- Prettier for formatting (config in `.prettierrc.json`).
- **≥ 90 %** line / function / statement coverage; **≥ 85 %** branch coverage. CI fails below the threshold.

## Tests

- Unit tests live in `tests/unit/` and mirror `src/`.
- Mock at the Octokit boundary via `makeFakeOctokit` in `tests/helpers/fake-octokit.ts`. Do not mock at the HTTP layer.
- Time-sensitive code accepts an injected `now: Date`; pass a fixed date in tests.
- `cli.ts` and `commands/*.ts` are excluded from coverage; they're thin glue exercised end-to-end through the pipeline tests.

## When `src/cli.ts` changes

Re-run the CLI reference generator and commit the result alongside the source change:

```bash
pnpm docs:gen-cli
git add docs/reference/cli.md
```

CI runs `pnpm docs:gen-cli` followed by `git diff --exit-code docs/reference/cli.md` in the static-checks job, so missing the regen fails CI with a visible diff. The file is still committed by hand — CI guardrails the freshness, it doesn't generate the artifact for you.

## Changesets

If your change is user-visible (new flag, behavior change, bug fix, breaking rename), add a changeset:

```bash
pnpm changeset
```

Pick `patch`, `minor`, or `major`, describe the change in one or two sentences,
and commit the resulting Markdown file in `.changeset/`.

Skip the changeset for purely internal work: refactors that preserve public
behavior, test-only changes, lockfile bumps, dev-dependency upgrades, CI
tweaks, formatting passes.

## Branch hygiene

- `main` is the integration branch.
- Open PRs against `main`. Squash-merge on green CI.
- Releases happen via the changesets workflow — never tag/release manually.

## Release secrets (maintainer-only)

The release pipeline needs three repo secrets and one environment to be
configured before it can publish:

| Secret / setting          | Purpose                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE_APP_ID`          | GitHub App ID for the bot that authors release commits and PRs.                                                                                                         |
| `RELEASE_APP_PRIVATE_KEY` | The matching GitHub App private key.                                                                                                                                    |
| `NPM_TOKEN`               | **Temporary** — only used until npm trusted publishing is configured on npmjs.org after the first 1.0.0 publish. Remove afterward; the workflow will fall back to OIDC. |
| Environment `npm-publish` | Gates the release job (configured under Settings → Environments).                                                                                                       |

The GitHub App must have `contents: write` and `pull-requests: write` on this
repo. Without these the release workflow stays inert — `.changeset/*.md` files
will accumulate on `main` but never produce a version PR.
