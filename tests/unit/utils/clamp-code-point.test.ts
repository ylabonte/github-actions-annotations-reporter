import { describe, expect, it } from 'vitest';
import { clampToCodePointBoundary } from '../../../src/utils/clamp-code-point.js';

describe('clampToCodePointBoundary', () => {
  it('passes through strings already within the cap', () => {
    expect(clampToCodePointBoundary('abc', 10)).toBe('abc');
    expect(clampToCodePointBoundary('abc', 3)).toBe('abc');
  });

  it('returns empty for max <= 0', () => {
    expect(clampToCodePointBoundary('abc', 0)).toBe('');
    expect(clampToCodePointBoundary('abc', -1)).toBe('');
  });

  it('cuts cleanly when the cap lands between codepoints', () => {
    // Five 'a's, cap at 3 → 'aaa' (no surrogate to worry about).
    expect(clampToCodePointBoundary('aaaaa', 3)).toBe('aaa');
  });

  it('backs off by one when the cap lands inside a surrogate pair', () => {
    // 😀 is U+1F600 → two UTF-16 code units. Place it at index 3-4 so
    // a max of 4 would land on the high surrogate.
    const s = 'abc\u{1F600}xyz'; // length 9 (3 + 2 + 3)
    const clamped = clampToCodePointBoundary(s, 4);
    expect(clamped).toBe('abc'); // backed off by one to avoid lone high surrogate
    expect(clamped.length).toBe(3);
  });

  it('keeps a full surrogate pair when the cap lands one past it', () => {
    const s = 'abc\u{1F600}xyz';
    expect(clampToCodePointBoundary(s, 5)).toBe('abc\u{1F600}');
  });
});
