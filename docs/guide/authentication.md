# Authentication

`ghaar` needs a GitHub token to read workflows / runs / annotations and
to file or update issues. Token resolution happens in this order:

1. **`--token <value>`** — explicit CLI flag. Highest priority.
2. **`GITHUB_TOKEN`** env var.
3. **`GH_TOKEN`** env var.
4. **`gh auth token`** — the GitHub CLI's stored session.
5. **Anonymous** — read-only, rate-limited to 60 req/hr. Cannot write issues.

The first source that returns a non-empty string wins.

## Resolving the target repository

Separate from auth, the CLI also needs to know which repo to scan. It
walks a parallel three-step chain — `--repo owner/name`, then the
`GITHUB_REPOSITORY` env var, then `git remote get-url origin` from the
current working directory. The last step makes a fresh `git clone …`
checkout work with no flags at all; non-GitHub remotes (GitLab,
Bitbucket, self-hosted GitHub Enterprise Server) are deliberately
ignored. See the [quickstart](./quickstart#resolve-the-target-repo) for
the full chain.

## Required scopes

For a personal access token (classic):

- `repo` — covers workflow / run reads + issue writes on private repos.
- `public_repo` — sufficient for public repos.

For a fine-grained PAT or a GitHub App:

- **Actions** — Read (workflow + run + job metadata).
- **Checks** — Read (annotation payloads live on check-runs).
- **Issues** — Read and write (filing + managing the issues).
- **Metadata** — Read (always required).
- **Contents** — Read (only needed if you scan a repo that requires it
  to list workflows; usually unnecessary).

## Running under `github.token` in a workflow

The workflow-provided token has _just enough_ permission as long as you
declare it explicitly:

```yaml
permissions:
  contents: read
  issues: write
```

You don't need `actions: read` separately — the `github.token` always
has read access to its own repo's Actions metadata.

## Local development

```bash
# One-shot
GITHUB_TOKEN="$(gh auth token)" ghaar scan --dry-run

# Or persist
echo 'export GITHUB_TOKEN="$(gh auth token)"' >> ~/.zshrc
```

The CLI never logs the token. The Octokit wrapper sends it in the
`Authorization` header only.

## Rate limits

With auth: 5 000 requests/hour for a personal token, 15 000/hour for an
Actions-provided `GITHUB_TOKEN`. The tool is pagination-aware and
careful about request counts:

- 1 call per workflow (list workflows).
- 1 call per workflow (latest run).
- 1 call per run (list jobs).
- 1 call per job (list annotations).
- A few extra to manage labels and to fetch closing comments when
  evaluating the won't-fix detector.

For a repo with ~20 workflows averaging ~10 jobs each, expect ~200–300
API calls per scan. Well below the per-hour budget even with a personal
token.
