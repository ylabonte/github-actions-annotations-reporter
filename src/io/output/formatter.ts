import pc from 'picocolors';
import type { ReconcileAction, ReportSummary, Severity } from '../../core/types.js';

export function colorSeverity(severity: Severity, text: string): string {
  if (severity === 'error') return pc.red(text);
  if (severity === 'warning') return pc.yellow(text);
  return pc.cyan(text);
}

export function colorAction(kind: ReconcileAction['kind'], text: string): string {
  switch (kind) {
    case 'create': {
      return pc.green(text);
    }
    case 'reopen': {
      return pc.magenta(text);
    }
    case 'update': {
      return pc.blue(text);
    }
    case 'suppressed': {
      return pc.gray(text);
    }
    case 'auto-close': {
      return pc.cyan(text);
    }
    case 'auto-close-hold': {
      return pc.gray(text);
    }
  }
}

export function summaryLine(summary: ReportSummary): string {
  const parts = [
    `annotations: ${summary.totalAnnotations.toString()}`,
    `new: ${pc.green(summary.newIssues.toString())}`,
    `updated: ${pc.blue(summary.updatedIssues.toString())}`,
    `reopened: ${pc.magenta(summary.reopenedIssues.toString())}`,
    `suppressed: ${pc.gray(summary.suppressed.toString())}`,
    `auto-closed: ${pc.cyan(summary.autoClosed.toString())}`,
    `held: ${pc.gray(summary.autoCloseHeld.toString())}`,
  ];
  if (summary.dryRun) parts.push(pc.dim('(dry run)'));
  return parts.join('  ');
}
