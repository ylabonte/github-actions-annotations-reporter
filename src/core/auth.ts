import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AuthSource = 'env' | 'gh-cli' | 'explicit' | 'anonymous';

export interface AuthResult {
  readonly token: string | null;
  readonly source: AuthSource;
}

export interface ResolveAuthOptions {
  readonly explicitToken?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly runGhCli?: () => Promise<string | null>;
}

/**
 * explicit (--token) → GITHUB_TOKEN / GH_TOKEN env → `gh auth token` → anonymous.
 * Anonymous is rate-limited (60 req/hr) and cannot create issues.
 */
export async function resolveAuth(options: ResolveAuthOptions = {}): Promise<AuthResult> {
  const explicit = options.explicitToken?.trim();
  if (explicit) return { token: explicit, source: 'explicit' };

  const env = options.env ?? process.env;
  // Normalize each candidate independently before combining. `??` would only
  // fall through on null/undefined, so an empty-string `GITHUB_TOKEN` (a
  // common CI pattern when a secret resolves but is empty) would shadow a
  // valid `GH_TOKEN`. `||` on already-trimmed candidates picks the first
  // non-empty value, which is the intent here.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const fromEnv = env['GITHUB_TOKEN']?.trim() || env['GH_TOKEN']?.trim();
  if (fromEnv) {
    return { token: fromEnv, source: 'env' };
  }

  const runGh = options.runGhCli ?? defaultGhAuthToken;
  try {
    const token = await runGh();
    if (token && token.trim().length > 0) {
      return { token: token.trim(), source: 'gh-cli' };
    }
  } catch {
    // gh not installed or not logged in — fall through.
  }

  return { token: null, source: 'anonymous' };
}

/* c8 ignore start — system-boundary: would need a real `gh` binary to exercise. */
async function defaultGhAuthToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
/* c8 ignore stop */
