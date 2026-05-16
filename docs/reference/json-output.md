# JSON output

The CLI's `--json` and `--json-out` options write a stable,
schema-versioned report. The action wrapper always writes one via
`mktemp` and surfaces the path as the `json` output.

## Schema

```ts
interface JsonReport {
  schemaVersion: 1;
  generatedAt: string; // ISO-8601 timestamp
  repo: { owner: string; repo: string };
  branch: string;
  summary: ReportSummary;
  actions: SerializedAction[];
  /** Present only when `--list-annotations` is set. */
  annotations?: SerializedAnnotation[];
}

interface ReportSummary {
  totalAnnotations: number;
  newIssues: number;
  updatedIssues: number;
  reopenedIssues: number;
  suppressed: number;
  autoClosed: number;
  autoCloseHeld: number;
  /** Create/update/reopen actions dropped because `max-issues` was exhausted. */
  skipped: number;
  dryRun: boolean;
}

interface SerializedAction {
  kind: 'create' | 'update' | 'reopen' | 'suppressed' | 'auto-close' | 'auto-close-hold';
  fingerprint: string; // sha256 hex
  issueNumber: number | null; // null for `create` (issue not yet filed)
  reason: string; // human-readable rationale
  severity: 'notice' | 'warning' | 'error' | null;
  workflow: string | null; // repo-relative path
  job: string | null;
  path: string | null; // annotation source file
  startLine: number | null;
  runUrl: string | null;
}

/** Only present when `--list-annotations` (or the `list-annotations` action input) is set. */
interface SerializedAnnotation {
  fingerprint: string;
  severity: 'notice' | 'warning' | 'error';
  message: string;
  title: string | null;
  rawDetails: string | null;
  path: string;
  startLine: number | null;
  endLine: number | null;
  workflow: { id: number; name: string; path: string };
  job: { id: number; name: string };
  run: {
    id: number;
    runNumber: number;
    htmlUrl: string;
    headBranch: string;
    headSha: string;
    conclusion: string | null;
    createdAt: string;
  };
}
```

## Compatibility

`schemaVersion` is bumped on **any** breaking change to the report
shape — field rename, removal, type narrowing, or kind addition that
old consumers couldn't tolerate.

Additive changes (new optional fields, new `kind` values consumers can
safely ignore) do not bump the version. Pin your jq queries on
specific known kinds, not on `kind != "…"`, to stay forward-compatible.

## Sample report

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-15T10:23:01.000Z",
  "repo": { "owner": "ylabonte", "repo": "demo" },
  "branch": "main",
  "summary": {
    "totalAnnotations": 4,
    "newIssues": 1,
    "updatedIssues": 2,
    "reopenedIssues": 0,
    "suppressed": 1,
    "autoClosed": 0,
    "autoCloseHeld": 0,
    "skipped": 0,
    "dryRun": false
  },
  "actions": [
    {
      "kind": "create",
      "fingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "issueNumber": null,
      "reason": "no prior issue for this fingerprint",
      "severity": "warning",
      "workflow": ".github/workflows/ci.yml",
      "job": "lint",
      "path": "src/foo.ts",
      "startLine": 42,
      "runUrl": "https://github.com/ylabonte/demo/actions/runs/1234"
    }
  ]
}
```

## The optional `annotations` field

When you pass `--list-annotations` to the CLI (or set `list-annotations: 'true'`
on the action), the report gains a top-level `annotations` array containing
the fully-deduplicated annotations the pipeline observed — one entry per
fingerprint. Each entry carries the full original annotation payload plus the
workflow / job / run context it was emitted from.

```json
{
  "annotations": [
    {
      "fingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "severity": "warning",
      "message": "Deprecated API: `foo()` is removed in v3. Migrate to `bar()`.",
      "title": null,
      "rawDetails": null,
      "path": "src/foo.ts",
      "startLine": 42,
      "endLine": 42,
      "workflow": {
        "id": 1,
        "name": "CI",
        "path": ".github/workflows/ci.yml"
      },
      "job": { "id": 100, "name": "lint" },
      "run": {
        "id": 11,
        "runNumber": 42,
        "htmlUrl": "https://github.com/ylabonte/demo/actions/runs/11",
        "headBranch": "main",
        "headSha": "abc1234567890abc1234567890abc1234567890",
        "conclusion": "success",
        "createdAt": "2026-05-15T10:00:00Z"
      }
    }
  ]
}
```

The field is **absent** when the flag is not set — this keeps existing
`schemaVersion: 1` consumers backward-compatible. Use `jq 'has("annotations")'`
to detect the flag's presence in a generic pipeline.

## Useful `jq` queries

```bash
# How many warnings were introduced this scan?
jq '[.actions[] | select(.kind == "create" and .severity == "warning")] | length' report.json

# Which workflows produced suppressions?
jq '[.actions[] | select(.kind == "suppressed") | .workflow] | unique' report.json

# Was anything auto-closed?
jq '.summary.autoClosed' report.json

# (With --list-annotations) every annotation message, grouped by workflow:
jq '.annotations | group_by(.workflow.path) | map({workflow: .[0].workflow.path, messages: [.[].message]})' report.json
```
