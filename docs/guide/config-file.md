# Config file

Most options can be set on the CLI or in a config file. CLI flags always
win on conflict.

## Search paths

`ghaar` uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig)
and searches the current working directory and its ancestors for the
first match of:

- `.ghaarrc`
- `.ghaarrc.json`
- `.ghaarrc.yaml`
- `.ghaarrc.yml`
- `ghaar.config.js`
- `ghaar.config.mjs`
- `ghaar.config.cjs`
- A `"ghaar"` key in `package.json`

## Schema

All fields are optional. The defaults shown below are applied when a
field is missing.

```json
{
  "workflows": [],
  "reject": [],
  "branch": null,
  "minSeverity": "notice",
  "managementLabel": "automation/annotation-reporter",
  "maxIssues": 25,
  "wontfix": {
    "labels": ["wontfix"],
    "respectStateReason": true,
    "commentPattern": null
  },
  "autoClose": {
    "enabled": true,
    "afterDays": 7,
    "afterMisses": 3,
    "requireSuccess": true
  }
}
```

### Field reference

| Field                        | Type                               | Notes                                                                                    |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `workflows`                  | `string[]`                         | Glob patterns matched against workflow names AND repo-relative paths. Empty = match all. |
| `reject`                     | `string[]`                         | Glob patterns excluded from the scan. Excludes win over includes.                        |
| `branch`                     | `string \| null`                   | Branch whose latest run is scanned. `null` = repo's default branch.                      |
| `minSeverity`                | `"notice" \| "warning" \| "error"` | Annotations below this drop out of the scan.                                             |
| `managementLabel`            | `string`                           | Label applied to every issue we own; used as the lookup key for prior issues.            |
| `maxIssues`                  | `integer ≥ 1`                      | Cap on create/update/reopen writes per run. Auto-close is unthrottled.                   |
| `wontfix.labels`             | `string[]`                         | Closed issues with any of these labels suppress future filings.                          |
| `wontfix.respectStateReason` | `boolean`                          | Treat `state_reason: not_planned` as suppression.                                        |
| `wontfix.commentPattern`     | `string \| null`                   | Regex matched against the closing comment. `null` disables.                              |
| `autoClose.enabled`          | `boolean`                          | Master switch for the vanish pass.                                                       |
| `autoClose.afterDays`        | `integer ≥ 0`                      | Min days since last-seen before close. `0` closes on the first miss (not recommended).   |
| `autoClose.afterMisses`      | `integer ≥ 1`                      | Min consecutive scans the annotation must be absent.                                     |
| `autoClose.requireSuccess`   | `boolean`                          | Refuse to auto-close when the workflow's latest run did not succeed.                     |

## Example: tightening up

```yaml
# .ghaarrc.yaml
workflows: ['ci.yml', 'release.yml']
minSeverity: warning
maxIssues: 50
wontfix:
  labels: [wontfix, accepted-noise]
  commentPattern: '(?i)wont ?fix|accepted'
autoClose:
  afterDays: 3
  afterMisses: 2
```

## Precedence

For each option:

1. CLI flag (highest priority).
2. Config file value.
3. Default (lowest priority).

Nested objects (`wontfix`, `autoClose`) deep-merge: config-file fields
not overridden by a CLI flag are kept.
