import * as core from '@actions/core';
import type { ReportSummary } from '../core/types.js';

export function isGitHubActionsEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['GITHUB_ACTIONS'] === 'true';
}

export interface EmitActionOutputsArgs {
  readonly summary: ReportSummary;
  readonly jsonPath: string | null;
}

export function emitActionOutputs(args: EmitActionOutputsArgs): void {
  if (!isGitHubActionsEnv()) return;
  core.setOutput('new-issues', args.summary.newIssues);
  core.setOutput('updated-issues', args.summary.updatedIssues);
  core.setOutput('reopened-issues', args.summary.reopenedIssues);
  core.setOutput('suppressed', args.summary.suppressed);
  core.setOutput('auto-closed', args.summary.autoClosed);
  core.setOutput('auto-close-held', args.summary.autoCloseHeld);
  core.setOutput('total-annotations', args.summary.totalAnnotations);
  if (args.jsonPath) core.setOutput('json', args.jsonPath);
}

export function failAction(message: string): void {
  if (isGitHubActionsEnv()) core.setFailed(message);
}
