---
'github-actions-annotations-reporter': patch
---

Shorten the `description` field in `action.yml` so it fits the GitHub Marketplace listing constraint (≤125 chars). The previous 199-char description was rejected by the Marketplace publishing flow as "missing a proper description". Same scope, fewer words: "Turn workflow annotations into dedup-aware GitHub Issues — severity-labeled, won't-fix-aware, auto-closing when noise stops." No behavior change.
