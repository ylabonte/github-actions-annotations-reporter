---
'github-actions-annotations-reporter': patch
---

Fix `ghaar` exiting silently when installed via `npm install -g`. The main-module detection in `src/cli.ts` compared `process.argv[1]` (the npm bin symlink, unresolved) against `import.meta.url` (the resolved module path), so the auto-invoke check returned false and the CLI never ran. `realpathSync()` now follows the symlink before the comparison. `pnpm run dev` and direct `node dist/cli.js` invocations were not affected; only the globally-installed binary exhibited the bug.
