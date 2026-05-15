import { describe, expect, it } from 'vitest';
import { buildJsonReport } from '../../../src/io/output/json.js';
import { makeIssue, REPO } from '../../helpers/fixtures.js';
import type { ReconcileAction, ReportSummary } from '../../../src/core/types.js';

const summary: ReportSummary = {
  totalAnnotations: 0,
  newIssues: 0,
  updatedIssues: 0,
  reopenedIssues: 0,
  suppressed: 0,
  autoClosed: 1,
  autoCloseHeld: 0,
  dryRun: false,
};

describe('buildJsonReport — actions without annotations', () => {
  it('serializes auto-close actions with workflow path from prior parsedState', () => {
    const prior = makeIssue({
      number: 99,
      parsedState: {
        lastSeenAt: 'x',
        missCounter: 5,
        firstSeenAt: 'y',
        workflowPath: '.github/workflows/release.yml',
      },
    });
    const action: ReconcileAction = {
      kind: 'auto-close',
      fingerprint: 'abc',
      issueNumber: 99,
      annotation: null,
      priorIssue: prior,
      reason: 'vanished',
    };
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [action],
      now: new Date(),
    });
    expect(report.actions[0]!.workflow).toBe('.github/workflows/release.yml');
    expect(report.actions[0]!.job).toBeNull();
    expect(report.actions[0]!.severity).toBeNull();
    expect(report.actions[0]!.runUrl).toBeNull();
  });

  it('serializes auto-close actions with null fallbacks when nothing is available', () => {
    const prior = makeIssue({ number: 77, parsedState: null });
    const action: ReconcileAction = {
      kind: 'auto-close-hold',
      fingerprint: 'abc',
      issueNumber: 77,
      annotation: null,
      priorIssue: prior,
      reason: 'holding',
    };
    const report = buildJsonReport({
      repo: REPO,
      branch: 'main',
      summary,
      actions: [action],
      now: new Date(),
    });
    expect(report.actions[0]!.workflow).toBeNull();
  });
});
