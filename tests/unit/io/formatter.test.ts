import { describe, expect, it } from 'vitest';
import { colorAction, colorSeverity } from '../../../src/io/output/formatter.js';

describe('colorSeverity', () => {
  it('handles all three severities', () => {
    expect(colorSeverity('notice', 'x')).toContain('x');
    expect(colorSeverity('warning', 'x')).toContain('x');
    expect(colorSeverity('error', 'x')).toContain('x');
  });
});

describe('colorAction', () => {
  it('handles every action kind', () => {
    for (const kind of [
      'create',
      'update',
      'reopen',
      'suppressed',
      'auto-close',
      'auto-close-hold',
    ] as const) {
      expect(colorAction(kind, kind)).toContain(kind);
    }
  });
});
