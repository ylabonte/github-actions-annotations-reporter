import { describe, expect, it } from 'vitest';
import { NOOP_PROGRESS, createProgress, type ProgressReporter } from '../../../src/io/progress.js';

describe('NOOP_PROGRESS', () => {
  it('exposes start/update/succeed/fail without throwing', () => {
    expect(() => {
      NOOP_PROGRESS.start('start');
      NOOP_PROGRESS.update('update');
      NOOP_PROGRESS.succeed('succeed');
      NOOP_PROGRESS.fail('fail');
      // Also call the no-arg overloads.
      NOOP_PROGRESS.succeed();
      NOOP_PROGRESS.fail();
    }).not.toThrow();
  });

  it('is the reference returned when createProgress is disabled', () => {
    expect(createProgress({ enabled: false })).toBe(NOOP_PROGRESS);
  });

  it('cannot be mutated (frozen object)', () => {
    expect(Object.isFrozen(NOOP_PROGRESS)).toBe(true);
  });
});

describe('createProgress', () => {
  it('returns an ora-backed reporter when enabled', () => {
    const reporter: ProgressReporter = createProgress({ enabled: true });
    expect(reporter).not.toBe(NOOP_PROGRESS);
    expect(typeof reporter.start).toBe('function');
    expect(typeof reporter.update).toBe('function');
    expect(typeof reporter.succeed).toBe('function');
    expect(typeof reporter.fail).toBe('function');
  });
});
