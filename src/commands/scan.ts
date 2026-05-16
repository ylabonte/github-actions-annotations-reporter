import { emitResults, executePipeline, type CommonCliOptions } from './shared.js';

export async function runScanCommand(opts: CommonCliOptions): Promise<number> {
  const result = await executePipeline(opts, false);
  await emitResults({ opts, result });
  return 0;
}
