import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadConfig,
  mergeWithOverrides,
  type ConfigOverrides,
  type ResolvedConfig,
} from '../core/config.js';
import { parseRepoSlug } from '../core/github/repo.js';
import type { RepoRef, Severity } from '../core/types.js';
import { runPipeline, type RunPipelineResult } from '../core/pipeline.js';
import { buildJsonReport } from '../io/output/json.js';
import { renderActionsTable } from '../io/output/table.js';
import { summaryLine } from '../io/output/formatter.js';
import { renderAnnotationsList } from '../io/output/annotations-list.js';
import { emitActionOutputs } from '../io/action-outputs.js';
import { createProgress } from '../io/progress.js';

export interface CommonCliOptions {
  readonly token?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly workflows?: readonly string[];
  readonly reject?: readonly string[];
  readonly minSeverity?: Severity;
  readonly managementLabel?: string;
  readonly maxIssues?: number;
  readonly wontfixLabels?: readonly string[];
  readonly wontfixRespectStateReason?: boolean;
  readonly wontfixCommentPattern?: string;
  readonly autoClose?: boolean;
  readonly autoCloseAfterDays?: number;
  readonly autoCloseAfterMisses?: number;
  readonly autoCloseRequireSuccess?: boolean;
  readonly json?: boolean;
  readonly jsonOut?: string;
  readonly dryRun?: boolean;
  readonly failOnNew?: boolean;
  readonly listAnnotations?: boolean;
  readonly progress?: boolean;
}

export interface PreparedRun {
  readonly config: ResolvedConfig;
  readonly repo: RepoRef | undefined;
  readonly token: string | undefined;
}

export async function prepareRun(opts: CommonCliOptions): Promise<PreparedRun> {
  const fileConfig = await loadConfig();
  const wontfix: Partial<ResolvedConfig['wontfix']> = {
    ...(opts.wontfixLabels ? { labels: [...opts.wontfixLabels] } : {}),
    ...(typeof opts.wontfixRespectStateReason === 'boolean'
      ? { respectStateReason: opts.wontfixRespectStateReason }
      : {}),
    ...(typeof opts.wontfixCommentPattern === 'string'
      ? { commentPattern: opts.wontfixCommentPattern || null }
      : {}),
  };
  const autoClose: Partial<ResolvedConfig['autoClose']> = {
    ...(typeof opts.autoClose === 'boolean' ? { enabled: opts.autoClose } : {}),
    ...(typeof opts.autoCloseAfterDays === 'number' ? { afterDays: opts.autoCloseAfterDays } : {}),
    ...(typeof opts.autoCloseAfterMisses === 'number'
      ? { afterMisses: opts.autoCloseAfterMisses }
      : {}),
    ...(typeof opts.autoCloseRequireSuccess === 'boolean'
      ? { requireSuccess: opts.autoCloseRequireSuccess }
      : {}),
  };
  const overrides: ConfigOverrides = {
    ...(opts.workflows && opts.workflows.length > 0 ? { workflows: [...opts.workflows] } : {}),
    ...(opts.reject && opts.reject.length > 0 ? { reject: [...opts.reject] } : {}),
    ...(opts.branch ? { branch: opts.branch } : {}),
    ...(opts.minSeverity ? { minSeverity: opts.minSeverity } : {}),
    ...(opts.managementLabel ? { managementLabel: opts.managementLabel } : {}),
    ...(typeof opts.maxIssues === 'number' ? { maxIssues: opts.maxIssues } : {}),
    wontfix,
    autoClose,
  };

  const config = mergeWithOverrides(fileConfig, overrides);
  const repo = opts.repo ? parseRepoSlug(opts.repo) : undefined;
  return { config, repo, token: opts.token };
}

export interface ReportOutputOptions {
  readonly opts: CommonCliOptions;
  readonly result: RunPipelineResult;
  readonly stdout?: NodeJS.WriteStream;
}

export async function emitResults(args: ReportOutputOptions): Promise<{ jsonPath: string | null }> {
  const { opts, result } = args;
  const out = args.stdout ?? process.stdout;
  const includeAnnotations = Boolean(opts.listAnnotations);
  const jsonReport = buildJsonReport({
    repo: result.repo,
    branch: result.branch,
    summary: result.summary,
    actions: result.actions,
    now: new Date(),
    includeAnnotations,
    annotations: result.annotations,
  });

  // Only write a JSON file when the caller explicitly asked for one via
  // `--json-out`. `--json` alone emits to stdout — that's enough for a
  // direct CLI consumer, and the action wrapper always passes `--json-out`
  // anyway (via `mktemp` in the bash dispatcher), so the action's `json`
  // output keeps working. Previously, `--json` alone wrote a stray file
  // under `RUNNER_TEMP`/`os.tmpdir()` with no cleanup — invisible on
  // GitHub-hosted runners (per-job wipe) but accumulating indefinitely on
  // self-hosted runners that use the CLI directly.
  let jsonPath: string | null = null;
  if (opts.jsonOut) {
    // Create the parent directory if needed — fs.writeFile would otherwise
    // fail with a cryptic ENOENT on a missing intermediate component.
    // `recursive: true` is a no-op when the directory already exists.
    await fs.mkdir(path.dirname(path.resolve(opts.jsonOut)), { recursive: true });
    await fs.writeFile(opts.jsonOut, `${JSON.stringify(jsonReport, null, 2)}\n`);
    jsonPath = path.resolve(opts.jsonOut);
  }

  if (opts.json) {
    out.write(`${JSON.stringify(jsonReport, null, 2)}\n`);
  } else {
    out.write(`${renderActionsTable(result.actions)}\n`);
    out.write(`${summaryLine(result.summary)}\n`);
    if (includeAnnotations) {
      out.write(`\n${renderAnnotationsList(result.annotations)}\n`);
    }
    if (jsonPath) out.write(`json report: ${jsonPath}\n`);
  }

  emitActionOutputs({ summary: result.summary, jsonPath });
  return { jsonPath };
}

export async function executePipeline(
  opts: CommonCliOptions,
  applyMode: boolean,
): Promise<RunPipelineResult> {
  const prepared = await prepareRun(opts);
  const progress = createProgress({ enabled: shouldShowProgress(opts) });
  try {
    return await runPipeline({
      config: prepared.config,
      explicitToken: prepared.token ?? '',
      ...(prepared.repo ? { explicitRepo: prepared.repo } : {}),
      dryRun: Boolean(opts.dryRun),
      applyMode,
      progress,
    });
  } catch (error) {
    // Cleanly stop any in-flight spinner so the terminal isn't left in a weird state.
    progress.fail('Pipeline failed');
    throw error;
  }
}

export function shouldShowProgress(opts: CommonCliOptions): boolean {
  if (opts.progress === false) return false;
  if (opts.json) return false;
  // In the @types/node version this project resolves, `process.stderr.isTTY`
  // is typed as `boolean`, so direct return satisfies the declared contract
  // and tsc enforces it. Older / different installations have used
  // `true | undefined`; if the upstream type ever regresses our typecheck
  // catches it here, and lint rules (no-unnecessary-{condition,type-
  // conversion,boolean-literal-compare}) collectively reject every form of
  // defensive normalization that would silently mask the change.
  return process.stderr.isTTY;
}
