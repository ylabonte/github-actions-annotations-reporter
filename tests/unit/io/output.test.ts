import { describe, expect, it } from 'vitest';
import { renderActionsTable } from '../../../src/io/output/table.js';
import { summaryLine } from '../../../src/io/output/formatter.js';
import { buildJsonReport } from '../../../src/io/output/json.js';
import { makeAnnotation, makeIssue, REPO } from '../../helpers/fixtures.js';
import type { ReconcileAction, ReportSummary } from '../../../src/core/types.js';

const NOW = new Date('2026-05-15T10:00:00Z');

const summary: ReportSummary = {
  totalAnnotations: 3,
  newIssues: 1,
  updatedIssues: 1,
  reopenedIssues: 0,
  suppressed: 1,
  autoClosed: 0,
  autoCloseHeld: 0,
  dryRun: false,
};

describe('renderActionsTable', () => {
  it('returns a placeholder when there are no actions', () => {
    expect(renderActionsTable([])).toContain('no actions');
  });

  it('renders one row per action with the issue number', () => {
    const ann = makeAnnotation();
    const actions: ReconcileAction[] = [
      {
        kind: 'create',
        fingerprint: ann.fingerprint,
        issueNumber: null,
        annotation: ann,
        priorIssue: null,
        reason: 'no prior issue',
      },
      {
        kind: 'auto-close',
        fingerprint: 'x',
        issueNumber: 42,
        annotation: null,
        priorIssue: makeIssue({ number: 42 }),
        reason: 'vanished',
      },
    ];
    const out = renderActionsTable(actions);
    expect(out).toContain('create');
    expect(out).toContain('auto-close');
    expect(out).toContain('#42');
  });
});

describe('summaryLine', () => {
  it('shows the dry-run marker when applicable', () => {
    const dry = summaryLine({ ...summary, dryRun: true });
    expect(dry).toContain('dry run');
  });

  it('omits the dry-run marker on real runs', () => {
    expect(summaryLine(summary)).not.toContain('dry run');
  });
});

describe('buildJsonReport', () => {
  it('produces a stable, schema-versioned report', () => {
    const ann = makeAnnotation();
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [
        {
          kind: 'create',
          fingerprint: ann.fingerprint,
          issueNumber: null,
          annotation: ann,
          priorIssue: null,
          reason: 'no prior issue',
        },
      ],
      now: NOW,
    });
    expect(report.schemaVersion).toBe(1);
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.repo).toEqual(REPO);
    expect(report.actions[0]!.severity).toBe('warning');
    expect(report.actions[0]!.workflow).toBe(ann.workflow.path);
  });

  it('omits the annotations field by default (backward compat)', () => {
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [],
      now: NOW,
    });
    expect('annotations' in report).toBe(false);
  });

  it('includes a serialized annotations array when includeAnnotations is true', () => {
    const ann = makeAnnotation({ rawDetails: 'trace' });
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [],
      now: NOW,
      includeAnnotations: true,
      annotations: [ann],
    });
    expect(report.annotations).toHaveLength(1);
    const a = report.annotations![0]!;
    expect(a.fingerprint).toBe(ann.fingerprint);
    expect(a.severity).toBe('warning');
    expect(a.message).toBe(ann.message);
    expect(a.rawDetails).toBe('trace');
    expect(a.workflow).toEqual({
      id: ann.workflow.id,
      name: ann.workflow.name,
      path: ann.workflow.path,
    });
    expect(a.job).toEqual({ id: ann.job.id, name: ann.job.name });
    expect(a.run.runNumber).toBe(ann.run.runNumber);
    expect(a.run.headSha).toBe(ann.run.headSha);
    expect(a.run.htmlUrl).toBe(ann.run.htmlUrl);
  });

  it('serializes an empty array when includeAnnotations is true but annotations is undefined', () => {
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [],
      now: NOW,
      includeAnnotations: true,
    });
    expect(report.annotations).toEqual([]);
  });
});
