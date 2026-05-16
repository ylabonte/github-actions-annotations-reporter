# Recipes

Short, opinionated patterns for situations you'll likely hit once the
basics are in place. Each recipe is a focused walkthrough — not a
reference and not a tutorial — so reach for them when you have a
specific problem to solve, not when you're learning the tool from
scratch.

If you're new here, start with the [quickstart](../guide/quickstart),
then come back when one of these fits.

## Available recipes

- **[Severity & suppression](./severity-and-suppression)** — managing
  noise with `--min-severity`, won't-fix labels, the native
  `state_reason: not_planned` closure, and closing-comment regex
  patterns. Includes the precedence rules between the three suppression
  signals and how to round-trip a closed issue back into a fresh
  filing.
- **[Filtering workflows](./filtering)** — include / exclude globs for
  monorepos, noisy auxiliary pipelines, or scheduled scans that should
  ignore release-only CI. Covers case-insensitive matching, composition
  with `--min-severity`, and the difference between filtering by
  workflow name and by workflow file path.

## What's missing — and might land later

The list above is the small set we use ourselves. We have rough drafts
for the recipes below; they'll be folded in as soon as a real-world
example gives them shape rather than abstractions:

- **PR gating with `--fail-on-new`** — fail a PR check when the diff
  introduces a new annotation, but never on the existing backlog.
- **Multi-repo or organization-wide scanning** — running `ghaar` against
  every repo in an org from a single scheduled workflow.
- **Custom labels and routing** — using your own management label and
  fine-grained severity labels (e.g. `triage/lint-warning`) without
  forking the tool.

If you have a real use case that needs one of these sooner, open an
[issue](https://github.com/ylabonte/github-actions-annotations-reporter/issues)
with the rough shape — the fastest way to get a recipe written is to
need it.

## Contributing a recipe

Recipes are plain markdown files under `docs/recipes/`. Keep them
under ~150 lines, lead with the problem, show the smallest config /
command sequence that solves it, and end with one paragraph on the
trade-offs. The recipe should make sense to a reader who skipped every
other docs page.
