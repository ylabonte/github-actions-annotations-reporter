import { describe, expect, it } from 'vitest';
import { mergeWithOverrides, parseUserConfig } from '../../../src/core/config.js';

describe('parseUserConfig', () => {
  it('produces sensible defaults for an empty input', () => {
    const cfg = parseUserConfig({});
    expect(cfg.minSeverity).toBe('notice');
    expect(cfg.managementLabel).toBe('automation/annotation-reporter');
    expect(cfg.wontfix.labels).toEqual(['wontfix']);
    expect(cfg.wontfix.respectStateReason).toBe(true);
    expect(cfg.wontfix.commentPattern).toBeNull();
    expect(cfg.autoClose.enabled).toBe(true);
    expect(cfg.autoClose.afterDays).toBe(7);
    expect(cfg.autoClose.afterMisses).toBe(3);
    expect(cfg.autoClose.requireSuccess).toBe(true);
  });

  it('accepts partial user input and applies remaining defaults', () => {
    const cfg = parseUserConfig({
      minSeverity: 'error',
      wontfix: { labels: ['nope'] },
      autoClose: { afterDays: 14 },
    });
    expect(cfg.minSeverity).toBe('error');
    expect(cfg.wontfix.labels).toEqual(['nope']);
    expect(cfg.wontfix.respectStateReason).toBe(true);
    expect(cfg.autoClose.afterDays).toBe(14);
    expect(cfg.autoClose.afterMisses).toBe(3);
  });

  it('rejects invalid severity', () => {
    expect(() => parseUserConfig({ minSeverity: 'lol' })).toThrow();
  });

  it('treats null/undefined nested blocks as empty (zod defaults fire)', () => {
    const cfg = parseUserConfig({ wontfix: null, autoClose: undefined });
    expect(cfg.wontfix.labels).toEqual(['wontfix']);
    expect(cfg.autoClose.enabled).toBe(true);
  });

  it('raises an explicit, field-named error for non-object nested blocks', () => {
    expect(() => parseUserConfig({ wontfix: false })).toThrow(/wontfix/);
    expect(() => parseUserConfig({ autoClose: 42 })).toThrow(/autoClose/);
    expect(() => parseUserConfig({ wontfix: ['oops'] })).toThrow(/wontfix.*array/i);
  });
});

describe('mergeWithOverrides', () => {
  it('overrides scalar fields', () => {
    const base = parseUserConfig({});
    const merged = mergeWithOverrides(base, { minSeverity: 'warning', maxIssues: 5 });
    expect(merged.minSeverity).toBe('warning');
    expect(merged.maxIssues).toBe(5);
  });

  it('deep-merges wontfix and autoClose blocks', () => {
    const base = parseUserConfig({});
    const merged = mergeWithOverrides(base, {
      wontfix: { ...base.wontfix, commentPattern: 'noise' },
      autoClose: { ...base.autoClose, afterMisses: 10 },
    });
    expect(merged.wontfix.commentPattern).toBe('noise');
    expect(merged.wontfix.labels).toEqual(['wontfix']);
    expect(merged.autoClose.afterMisses).toBe(10);
    expect(merged.autoClose.requireSuccess).toBe(true);
  });
});
