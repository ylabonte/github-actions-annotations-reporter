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
    wontfix: obj['wontfix'] ?? {},
    autoClose: obj['autoClose'] ?? {},
  });
}

export function mergeWithOverrides(
  base: ResolvedConfig,
  overrides: Partial<ResolvedConfig>,
): ResolvedConfig {
  return ConfigSchema.parse({
    ...base,
    ...overrides,
    wontfix: { ...base.wontfix, ...overrides.wontfix },
    autoClose: { ...base.autoClose, ...overrides.autoClose },
  });
}
