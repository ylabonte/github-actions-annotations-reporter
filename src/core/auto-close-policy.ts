import type { IssueRecord, RunInfo } from './types.js';

export interface AutoCloseConfig {
  readonly enabled: boolean;
  readonly afterDays: number;
  readonly afterMisses: number;
  readonly requireSuccess: boolean;
}

export type AutoCloseDecision =
  | { readonly kind: 'close'; readonly newMissCounter: number; readonly reason: string }
  | { readonly kind: 'hold'; readonly newMissCounter: number; readonly reason: string }
  | { readonly kind: 'skip'; readonly reason: string };

export interface EvaluateAutoCloseArgs {
  readonly issue: IssueRecord;
  readonly config: AutoCloseConfig;
  /** Latest run for the workflow that originally produced this annotation. */
  readonly workflowLatestRun: RunInfo | null;
  /** Whether the workflow was actually within the include/exclude scope this scan. */
  readonly workflowInScope: boolean;
  readonly now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateAutoClose(args: EvaluateAutoCloseArgs): AutoCloseDecision {
  const { issue, config, workflowLatestRun, workflowInScope, now } = args;

  if (!config.enabled) {
    return { kind: 'skip', reason: 'auto-close disabled' };
  }
  if (issue.state !== 'open') {
    return { kind: 'skip', reason: 'issue not open' };
  }
  if (!workflowInScope) {
    return { kind: 'skip', reason: 'source workflow outside scan scope' };
  }
  if (config.requireSuccess) {
    if (!workflowLatestRun) {
      return { kind: 'skip', reason: 'no recent run to confirm success' };
    }
    if (workflowLatestRun.conclusion !== 'success') {
      const conclusion = workflowLatestRun.conclusion ?? '(no conclusion)';
      return {
        kind: 'skip',
        reason: `latest run concluded "${conclusion}" — refusing to auto-close on potentially incomplete data`,
      };
    }
  }

  const priorMisses = issue.parsedState?.missCounter ?? 0;
  const newMissCounter = priorMisses + 1;

  const lastSeenAt = issue.parsedState?.lastSeenAt
    ? Date.parse(issue.parsedState.lastSeenAt)
    : Number.NaN;
  const ageDays = Number.isNaN(lastSeenAt)
    ? Number.POSITIVE_INFINITY
    : (now.getTime() - lastSeenAt) / DAY_MS;

  const missesOk = newMissCounter >= config.afterMisses;
  const ageOk = ageDays >= config.afterDays;
  // When `parsedState?.lastSeenAt` is missing, ageDays is +Infinity by design
  // (treat missing state as "infinitely old"). The sentinel makes the math
  // work but reads badly in a closing comment / JSON `reason` field
  // (`Infinity days`), so substitute a human-readable token when formatting.
  const ageDisplay = Number.isFinite(ageDays)
    ? `${ageDays.toFixed(1)} days`
    : 'an unknown number of days (no last-seen marker)';

  if (missesOk && ageOk) {
    return {
      kind: 'close',
      newMissCounter,
      reason: `absent for ${newMissCounter.toString()} consecutive scans and ${ageDisplay}`,
    };
  }
  return {
    kind: 'hold',
    newMissCounter,
    reason: `holding (misses=${newMissCounter.toString()}/${config.afterMisses.toString()}, age=${ageDisplay}/${config.afterDays.toString()} days)`,
  };
}

export function renderAutoCloseComment(args: {
  readonly missCounter: number;
  readonly lastSeenAt: string | null;
}): string {
  const lastSeen = args.lastSeenAt ?? '(unknown)';
  return [
    `Annotation no longer observed since \`${lastSeen}\` across ${args.missCounter.toString()} consecutive scans.`,
    '',
    'Auto-closed by [github-actions-annotations-reporter](https://github.com/ylabonte/github-actions-annotations-reporter). If the annotation returns, this issue will be reopened automatically.',
  ].join('\n');
}
