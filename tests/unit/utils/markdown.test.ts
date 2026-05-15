import { describe, expect, it } from 'vitest';
import { blockQuote, escapeHtmlCommentBody } from '../../../src/utils/markdown.js';

describe('escapeHtmlCommentBody', () => {
  it('breaks up HTML comment terminators', () => {
    expect(escapeHtmlCommentBody('a --> b')).toBe('a -- > b');
  });

  it('leaves benign text alone', () => {
    expect(escapeHtmlCommentBody('normal text')).toBe('normal text');
  });
});

describe('blockQuote', () => {
  it('prefixes every line with "> "', () => {
    expect(blockQuote('one\ntwo')).toBe('> one\n> two');
  });
});
