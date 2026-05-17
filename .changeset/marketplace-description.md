---
'github-actions-annotations-reporter': patch
---

Two Action-side fixes:

- **Marketplace listing:** Shorten the `description` field in `action.yml` to fit the GitHub Marketplace constraint (≤125 chars). The previous 199-char description was rejected at publish time as "missing a proper description". Same scope, fewer words: "Turn workflow annotations into dedup-aware GitHub Issues — severity-labeled, won't-fix-aware, auto-closing when noise stops."

- **Dispatcher reliability:** Replace the `npx -y -p PKG BIN` invocation in the composite action's bash dispatcher with an explicit `npm install --prefix <tmp>` followed by a direct `node_modules/.bin/ghaar` call. On `ubuntu-latest` runners (which ship npm 10.x in the ubuntu-24.04 image), both `npx -p` and `npm exec --package=` were observed to skip the install step and fall through to `sh -c "ghaar …"` → `command not found` → exit 127. The explicit install + direct bin invocation bypasses every bin-resolution code path and works identically on npm 10 and 11. No behavior change for callers; the action's inputs / outputs / env contracts are unchanged.
