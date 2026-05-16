# Security policy

`github-actions-annotations-reporter` reads workflow / run / annotation data
from the GitHub API, files and updates GitHub Issues, and runs inside
Actions runners with workflow-provided tokens. The threat surface includes
attacker-controlled annotation content, attacker-controlled issue
metadata, user-supplied regex patterns, and credentials in transit — so
security reports are taken seriously.

## Supported versions

Only the **latest major release** receives security fixes. When a new
major ships, the previous major is unsupported as of that release. Pin
to a specific major in `package.json` or in your workflow's `uses:` ref
if you want predictable upgrade timing.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

**Preferred:** use GitHub's
[private vulnerability reporting](https://github.com/ylabonte/github-actions-annotations-reporter/security/advisories/new)
on this repo. Your report goes into a private advisory thread visible
only to the maintainer (and any contributors the advisory is later
shared with).

**Fallback,** if private reporting isn't usable for you: email
**yannic.labonte@gmail.com** with the subject line starting `[ghaar
security]` so it's easy to triage. PGP isn't required, but if you'd
prefer encrypted email, ask in the first message and we'll exchange
keys before any details are sent.

### What to include

- A short description of the vulnerability and its expected impact.
- A minimal reproduction — ideally a workflow file, shell session, or
  fixture annotation/issue that triggers the issue against a freshly
  cloned checkout, or a pointer to the specific line(s) in source.
- The version you reproduced against (`ghaar --version` output, the
  `uses: ylabonte/github-actions-annotations-reporter@<ref>` ref, or a
  commit SHA).
- Optional: a suggested fix or mitigation.

You don't need to demonstrate end-to-end exploitation — a clear
description of the unsafe pattern plus a credible exploit path is
enough to triage.

## In scope

Anything that compromises confidentiality, integrity, or availability
beyond what's implied by running the CLI locally. Concretely:

- **Token leakage.** `GITHUB_TOKEN` / `GH_TOKEN` reaching anywhere
  outside the in-memory Octokit instance — logs, on-disk caches,
  stderr, child process argv, the JSON report.
- **Regex denial-of-service.** `wontfix-comment-pattern` is the
  highest-risk surface — it's compiled from user config and run against
  arbitrary issue comments. Patterns that hang the runner or burn
  excessive CPU on a crafted comment are in scope.
- **Wontfix-comment-pattern spoofing via unknown closer.** When an issue
  was closed by an actor whose account is no longer known (deleted user,
  API-driven closure without an `actor` populated), an attacker with
  comment-write access on the issue could otherwise plant text matching
  a configured `wontfix-comment-pattern` and silently suppress future
  filings of the same annotation. The detector mitigates this by failing
  closed — `getClosingComment` returns `null` when the closer is unknown,
  so the wontfix detector falls back to label / `state_reason` signals
  only on those issues. A regression that re-opens the "any commenter
  before close" fallback would be in scope.
- **Composite-action input bypass.** The `action.yml` `version` input
  is allowlisted to dist-tag / semver shapes; an input that escapes
  the allowlist and reaches `npx` is in scope.
- **Shell or command injection.** Any path where an
  attacker-controllable value (workflow name, glob, label name, regex)
  reaches a shell, an env-var name, a URL outside its expected slot,
  or a file path containing `..`.
- **Issue body marker forgery.** A crafted issue body that smuggles
  bogus state markers (`annot-state`) to cause the auto-close policy
  to close issues prematurely — or refuses to close them ever — is
  in scope.
- **Prototype pollution** when parsing user or remote YAML/JSON into
  objects that flow into Octokit, `execFile`, or `path.resolve`.
- **Supply-chain compromise** of
  `github-actions-annotations-reporter` itself — npm account takeover,
  a malicious dependency advisory we shipped without an override,
  GitHub Actions workflow injection in this repo's own CI.

## Out of scope

- Rate-limit pressure on unauthenticated GitHub API use (this is the
  documented anonymous mode; supply a token to lift it).
- A user passing `--token <secret>` and the secret appearing in _their
  own_ shell history.
- Findings in transitive dependencies that don't have an exploitable
  path through `github-actions-annotations-reporter` itself — those
  belong upstream and to Dependabot.
- Feature requests dressed up as security findings.
- Findings against `main`-branch code that haven't shipped to npm or
  to a floating `v<major>` action tag. Reports are welcome but won't
  be embargoed pre-release.

## Response

This is a best-effort, single-maintainer project. The one concrete
commitment: **every report is acknowledged within 7 days**, including a
note on whether it's been triaged as in-scope and a rough sense of the
next steps. Fix timelines depend on severity and maintainer capacity
and are negotiated in the advisory thread after triage.

## Disclosure

We follow a coordinated-disclosure model. When a fix is ready:

1. A GitHub Security Advisory is published on this repo, with a CVE
   requested when the impact warrants one.
2. A patch (or minor, if mitigation requires a behavior change) is
   released to npm; the floating `v<major>` action tag is moved to the
   new release.
3. Release notes credit the reporter by name and handle unless they
   ask to stay anonymous.

If 90 days pass without a fix and you've stayed in good-faith contact
with the maintainer, you may publish your finding regardless. We won't
pursue researchers acting in good faith.
