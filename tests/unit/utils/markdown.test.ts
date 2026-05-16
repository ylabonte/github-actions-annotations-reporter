import { describe, expect, it } from 'vitest';
import { blockQuote, escapeHtmlCommentBody } from '../../../src/utils/markdown.js';

// ZWSP (U+200B) is the separator inserted between adjacent `-` characters.
// Reference it via String.fromCodePoint so the test source stays ASCII-only
// (eslint's no-irregular-whitespace would otherwise complain).
const ZWSP = String.fromCodePoint(0x20_0b);

describe('escapeHtmlCommentBody', () => {
  it('breaks up the canonical HTML comment terminator `-->`', () => {
    expect(escapeHtmlCommentBody('a --> b')).toBe(`a -${ZWSP}-> b`);
  });

  it('breaks up the HTML5 alternative terminator `--!>`', () => {
    // HTML5 accepts `--!>` as a bogus comment terminator; without this
    // rewrite, a raw_details containing `--!>` could close one of our
    // <!-- annot-... --> markers when rendered.
    expect(escapeHtmlCommentBody('a --!> b')).toBe(`a -${ZWSP}-!> b`);
  });

  it('breaks up dash runs of 3+ (defends against `--->` and similar)', () => {
    // A `---` (or longer) run could be collapsed by some parsers into `-->`
    // or otherwise interpreted as a comment-close prefix; we insert a ZWSP
    // between every adjacent pair to prevent any such reformation.
    const out = escapeHtmlCommentBody('a --- b');
    expect(out).not.toContain('---');
    expect(out).toBe(`a -${ZWSP}-${ZWSP}- b`);
  });

  it('leaves benign text and single `-` characters alone', () => {
    expect(escapeHtmlCommentBody('normal - text')).toBe('normal - text');
    expect(escapeHtmlCommentBody('foo')).toBe('foo');
  });

  it('handles multiple terminators in one input independently', () => {
    expect(escapeHtmlCommentBody('a --> b --!> c')).toBe(`a -${ZWSP}-> b -${ZWSP}-!> c`);
  });
});

describe('blockQuote', () => {
  it('prefixes every line with "> "', () => {
    expect(blockQuote('one\ntwo')).toBe('> one\n> two');
  });
});
