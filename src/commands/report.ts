import { emitResults, executePipeline, type CommonCliOptions } from './shared.js';

export async function runReportCommand(opts: CommonCliOptions): Promise<number> {
  const result = await executePipeline(opts, true);
  await emitResults({ opts, result });
  if (opts.failOnNew && result.summary.newIssues > 0) return 2;
  return 0;
}
