import ora, { type Ora } from 'ora';

/**
 * Minimal phase-based progress contract. The pipeline calls these at phase
 * boundaries; the implementation may render a spinner, log lines, or do
 * nothing at all (CI / non-TTY / JSON mode).
 */
export interface ProgressReporter {
  /** Begin a new phase. Auto-finishes any prior phase as a side-effect (silent stop). */
  start(message: string): void;
  /** Update the current phase's text without changing the phase. */
  update(message: string): void;
  /** Finish the current phase with a success marker and an optional summary message. */
  succeed(message?: string): void;
  /** Finish the current phase with a failure marker. */
  fail(message?: string): void;
  /** Emit a one-off informational line independent of any phase. No-op when disabled. */
  note(message: string): void;
}

export interface CreateProgressOptions {
  /** Master switch — when false, returns a no-op reporter. */
  readonly enabled: boolean;
}

export function createProgress(options: CreateProgressOptions): ProgressReporter {
  if (!options.enabled) return NOOP_PROGRESS;
  return new OraProgress();
}

class NoopProgress implements ProgressReporter {
  start(): void {
    // intentionally empty
  }
  update(): void {
    // intentionally empty
  }
  succeed(): void {
    // intentionally empty
  }
  fail(): void {
    // intentionally empty
  }
  note(): void {
    // intentionally empty
  }
}

export const NOOP_PROGRESS: ProgressReporter = Object.freeze(new NoopProgress());

/* c8 ignore start — ora is a system-boundary; we test the no-op path only. */
class OraProgress implements ProgressReporter {
  private spinner: Ora | null = null;

  start(message: string): void {
    this.spinner?.stop();
    this.spinner = ora({ text: message, stream: process.stderr }).start();
  }

  update(message: string): void {
    if (this.spinner) this.spinner.text = message;
  }

  succeed(message?: string): void {
    if (!this.spinner) return;
    this.spinner.succeed(message);
    this.spinner = null;
  }

  fail(message?: string): void {
    if (!this.spinner) return;
    this.spinner.fail(message);
    this.spinner = null;
  }

  note(message: string): void {
    // If a spinner is active, stop it cleanly first so the note line doesn't
    // get mangled by the in-place spinner rewrite. Notes are emitted at phase
    // boundaries in practice (e.g. repo resolution before the first start()),
    // so this path is rarely hit but cheap to keep.
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    process.stderr.write(`${message}\n`);
  }
}
/* c8 ignore stop */
