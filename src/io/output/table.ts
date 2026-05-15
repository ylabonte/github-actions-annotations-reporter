import Table from 'cli-table3';
import type { ReconcileAction } from '../../core/types.js';
import { colorAction, colorSeverity } from './formatter.js';

export function renderActionsTable(actions: readonly ReconcileAction[]): string {
  if (actions.length === 0) return '(no actions)';
  const table = new Table({
    head: ['Action', 'Severity', 'Workflow', 'Path', 'Issue', 'Reason'],
    style: { head: ['bold'], border: [] },
    wordWrap: true,
  });
  for (const a of actions) {
    const ann = a.annotation;
    const sev = ann ? colorSeverity(ann.severity, ann.severity) : '—';
    const wf = ann?.workflow.path ?? a.priorIssue?.parsedState?.workflowPath ?? '—';
    const path = ann?.path ?? '—';
    const issue = a.issueNumber ? `#${a.issueNumber.toString()}` : '(new)';
    table.push([colorAction(a.kind, a.kind), sev, wf, path, issue, a.reason]);
  }
  return table.toString();
}
