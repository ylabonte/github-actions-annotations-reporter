/**
 * Slice `s` to at most `max` UTF-16 code units, backing off by one if the cut
 * would land between a high and low surrogate. Prevents an unpaired surrogate
 * from leaking out of the bounded string into downstream consumers (JSON
 * serialization, terminal renderers that may replace the orphan with U+FFFD,
 * Markdown linters, etc.). The trimmed-by-one case is the only deviation
 * from a raw `.slice()`.
 *
 * Uses `charCodeAt`, NOT `codePointAt`: when the index points at a high
 * surrogate that's part of a valid pair, `codePointAt` returns the
 * *combined* astral codepoint (e.g. 0x1F600 for 😀), bypassing the
 * surrogate-range check below. `charCodeAt` always returns the raw
 * UTF-16 code unit, so the range guard fires correctly.
 */
export function clampToCodePointBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return '';
  // eslint-disable-next-line unicorn/prefer-code-point
  const last = s.charCodeAt(max - 1);
  const cut = last >= 0xd8_00 && last <= 0xdb_ff ? max - 1 : max;
  return s.slice(0, cut);
}
