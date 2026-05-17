---
'github-actions-annotations-reporter': patch
---

Two Action-side fixes:

- **Marketplace listing:** Shorten the `description` field in `action.yml` to fit the GitHub Marketplace constraint (≤125 chars). The previous 199-char description was rejected at publish time as "missing a proper description". Same scope, fewer words: "Turn workflow annotations into dedup-aware GitHub Issues — severity-labeled, won't-fix-aware, auto-closing when noise stops."

- **Dispatcher reliability:** Switch the composite action's bash dispatcher from `npx -y -p X bin` to `npm exec --yes --package=X -- bin args`. On `ubuntu-latest` runners (which ship npm 10.x by default), the `-p X` form was observed to skip the install step and fall through to `sh -c "ghaar …"` → `command not found` → exit 127. The `npm exec --package=` form is unambiguous and works identically on npm 10 and 11. No behavior change for callers.
