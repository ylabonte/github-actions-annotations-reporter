import { describe, expect, it } from 'vitest';
import { computeFingerprint, normalizeMessage } from '../../../src/core/fingerprint.js';
import { makeRawAnnotation, makeWorkflow } from '../../helpers/fixtures.js';

describe('normalizeMessage', () => {
  it('strips trailing whitespace per line', () => {
    expect(normalizeMessage('foo   \nbar\t')).toBe('foo\nbar');
  });

  it('normalizes CRLF to LF', () => {
    expect(normalizeMessage('a\r\nb')).toBe('a\nb');
  });

  it('trims leading and trailing blank lines', () => {
    expect(normalizeMessage('\n\nfoo\n\n')).toBe('foo');
  });
});

describe('computeFingerprint', () => {
  it('is stable across whitespace differences', () => {
    const wf = makeWorkflow();
    const a = computeFingerprint(wf, makeRawAnnotation({ message: 'deprecated\n' }));
    const b = computeFingerprint(wf, makeRawAnnotation({ message: 'deprecated   ' }));
    expect(a).toBe(b);
  });

  it('does NOT depend on line numbers', () => {
    const wf = makeWorkflow();
    const a = computeFingerprint(wf, makeRawAnnotation({ startLine: 10, endLine: 10 }));
    const b = computeFingerprint(wf, makeRawAnnotation({ startLine: 200, endLine: 200 }));
    expect(a).toBe(b);
  });

  it('differs when the workflow path differs', () => {
    const a = computeFingerprint(
      makeWorkflow({ path: '.github/workflows/a.yml' }),
      makeRawAnnotation(),
    );
    const b = computeFingerprint(
      makeWorkflow({ path: '.github/workflows/b.yml' }),
      makeRawAnnotation(),
    );
    expect(a).not.toBe(b);
  });

  it('differs when the annotation path differs', () => {
    const wf = makeWorkflow();
    const a = computeFingerprint(wf, makeRawAnnotation({ path: 'src/a.ts' }));
    const b = computeFingerprint(wf, makeRawAnnotation({ path: 'src/b.ts' }));
    expect(a).not.toBe(b);
  });

  it('differs when the message differs', () => {
    const wf = makeWorkflow();
    const a = computeFingerprint(wf, makeRawAnnotation({ message: 'one' }));
    const b = computeFingerprint(wf, makeRawAnnotation({ message: 'two' }));
    expect(a).not.toBe(b);
  });
});
