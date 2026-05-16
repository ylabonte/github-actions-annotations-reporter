import { EXIT_NEW_ISSUES_FOUND, EXIT_OK } from './exit-codes.js';
import { emitResults, executePipeline, type CommonCliOptions } from './shared.js';

export async function runReportCommand(opts: CommonCliOptions): Promise<number> {
  const result = await executePipeline(opts, true);
  await emitResults({ opts, result });
  if (opts.failOnNew && result.summary.newIssues > 0) return EXIT_NEW_ISSUES_FOUND;
  return EXIT_OK;
}
