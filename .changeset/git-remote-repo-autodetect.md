---
'github-actions-annotations-reporter': minor
---

Auto-detect the target repository from the local git remote `origin` when neither `--repo` nor `GITHUB_REPOSITORY` is set. Running `ghaar scan` from inside a checked-out clone now works with no flags; the CLI emits a one-line stderr notice (`Resolved repo owner/name from local git remote 'origin'.`) so the inferred target is visible. Non-GitHub remotes (GitLab, Bitbucket, GitHub Enterprise Server) are ignored — pass `--repo` explicitly for those.

Refreshed every doc surface to describe the new three-step resolution chain (`--repo` → `GITHUB_REPOSITORY` → `git remote get-url origin`):

- `--help` (and `docs/reference/cli.md`) gained an Examples block plus an Environment variables section.
- README adds a badges row, a docs-site link, `ghaar` bin examples in place of the long `npx github-actions-annotations-reporter` form, a Contributing section, and a Docs & support section.
- `package.json` gained the `homepage`, `repository`, and `bugs` metadata fields that npm shows on the package page.
- VitePress nav now exposes a Release notes link.
