import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import type { Severity } from './types.js';

const SeveritySchema: z.ZodType<Severity> = z.enum(['notice', 'warning', 'error']);

const WontfixSchema = z.object({
  labels: z.array(z.string()).default(['wontfix']),
  respectStateReason: z.boolean().default(true),
  commentPattern: z.string().nullable().default(null),
});

const AutoCloseSchema = z.object({
  enabled: z.boolean().default(true),
  afterDays: z.number().int().min(0).default(7),
  afterMisses: z.number().int().min(1).default(3),
  requireSuccess: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  workflows: z.array(z.string()).default([]),
  reject: z.array(z.string()).default([]),
  branch: z.string().nullable().default(null),
  minSeverity: SeveritySchema.default('notice'),
  managementLabel: z.string().default('automation/annotation-reporter'),
  maxIssues: z.number().int().positive().default(25),
  wontfix: WontfixSchema,
  autoClose: AutoCloseSchema,
});

export type ResolvedConfig = z.infer<typeof ConfigSchema>;

const MODULE_NAME = 'ghaar';

export interface LoadConfigOptions {
  readonly cwd?: string;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.mjs`,
      `${MODULE_NAME}.config.cjs`,
      'package.json',
    ],
  });
  const result = await explorer.search(options.cwd);
  return parseUserConfig(result?.config);
}

export function parseUserConfig(input: unknown): ResolvedConfig {
  const obj = (input ?? {}) as Record<string, unknown>;
  return ConfigSchema.parse({
    ...obj,
    wontfix: normalizeNestedBlock(obj['wontfix'], 'wontfix'),
    autoClose: normalizeNestedBlock(obj['autoClose'], 'autoClose'),
  });
}

/**
 * Permissive nullish handling for nested config blocks. `null` / `undefined`
 * become `{}` so zod's per-field defaults fire; any other non-object value
 * (`wontfix: false`, `autoClose: 42`, an array, etc.) raises an explicit error
 * that names the offending field, instead of relying on zod's later
 * "Expected object" failure that points at the input root.
 */
function normalizeNestedBlock(value: unknown, fieldName: string): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new TypeError(
    `Config field "${fieldName}" must be an object (or null), got ${
      Array.isArray(value) ? 'array' : typeof value
    }.`,
  );
}

/**
 * Per-key partial override shape. `wontfix` and `autoClose` accept any subset
 * of their fields — callers commonly fill only the ones the user touched
 * (e.g. `wontfix: { labels }` when only `--wontfix-labels` was passed).
 * Using `Partial<ResolvedConfig>` here would force callers to construct a
 * complete sub-object (or `as`-cast a partial one, which is the bug this
 * type replaces).
 */
export interface ConfigOverrides {
  readonly workflows?: ResolvedConfig['workflows'];
  readonly reject?: ResolvedConfig['reject'];
  readonly branch?: ResolvedConfig['branch'];
  readonly minSeverity?: ResolvedConfig['minSeverity'];
  readonly managementLabel?: ResolvedConfig['managementLabel'];
  readonly maxIssues?: ResolvedConfig['maxIssues'];
  readonly wontfix?: Partial<ResolvedConfig['wontfix']>;
  readonly autoClose?: Partial<ResolvedConfig['autoClose']>;
}

export function mergeWithOverrides(
  base: ResolvedConfig,
  overrides: ConfigOverrides,
): ResolvedConfig {
  return ConfigSchema.parse({
    ...base,
    ...overrides,
    wontfix: { ...base.wontfix, ...overrides.wontfix },
    autoClose: { ...base.autoClose, ...overrides.autoClose },
  });
}
