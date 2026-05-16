import { describe, expect, it } from 'vitest';
import {
  MAX_RENDERED_FIELD_CHARS,
  renderAnnotationsList,
} from '../../../src/io/output/annotations-list.js';
import { makeAnnotation } from '../../helpers/fixtures.js';

function strip(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('renderAnnotationsList', () => {
  it('returns the empty-state string when there are no annotations', () => {
    expect(renderAnnotationsList([])).toBe('(no annotations)');
  });

  it('renders every required field for a single annotation', () => {
    const ann = makeAnnotation({
      severity: 'warning',
      message: 'deprecated foo()',
      title: null,
    });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).toContain('Annotation 1');
    expect(out).toContain('Severity:');
    expect(out).toContain('warning');
    expect(out).toContain(`Fingerprint: ${ann.fingerprint}`);
    expect(out).toContain(`Workflow:    ${ann.workflow.path} (${ann.workflow.name})`);
    expect(out).toContain(`Job:         ${ann.job.name}`);
    expect(out).toContain(
      `Run:         #${ann.run.runNumber.toString()} — ${ann.run.conclusion} — ${ann.run.htmlUrl}`,
    );
    expect(out).toContain(`Branch:      ${ann.run.headBranch} @ ${ann.run.headSha.slice(0, 7)}`);
    expect(out).toContain('Path:        src/foo.ts (line 42)');
    expect(out).toContain('Title:       (none)');
    expect(out).toContain('Message:');
    expect(out).toContain('      deprecated foo()');
  });

  it('renders an annotation title when provided', () => {
    const ann = makeAnnotation({ title: 'Deprecated API' });
    expect(strip(renderAnnotationsList([ann]))).toContain('Title:       Deprecated API');
  });

  it('omits the Raw details row when rawDetails is null', () => {
    const ann = makeAnnotation();
    expect(strip(renderAnnotationsList([ann]))).not.toContain('Raw details:');
  });

  it('includes Raw details when provided', () => {
    const ann = makeAnnotation({ rawDetails: 'stack trace here\nline two' });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).toContain('Raw details:');
    expect(out).toContain('      stack trace here');
    expect(out).toContain('      line two');
  });

  it('handles a missing path gracefully', () => {
    const ann = makeAnnotation({ path: '', startLine: null, endLine: null });
    expect(strip(renderAnnotationsList([ann]))).toContain('Path:        (no file)');
  });

  it('omits the line spec when startLine is null', () => {
    const ann = makeAnnotation({ startLine: null, endLine: null });
    expect(strip(renderAnnotationsList([ann]))).toContain('Path:        src/foo.ts\n');
  });

  it('renders a line range when start and end differ', () => {
    const ann = makeAnnotation({ startLine: 10, endLine: 20 });
    expect(strip(renderAnnotationsList([ann]))).toContain('Path:        src/foo.ts (lines 10–20)');
  });

  it('numbers multiple annotations consecutively', () => {
    const a = makeAnnotation({ message: 'first' });
    const b = makeAnnotation({ message: 'second' });
    const out = strip(renderAnnotationsList([a, b]));
    expect(out).toContain('Annotation 1');
    expect(out).toContain('Annotation 2');
  });

  it('renders a missing run conclusion as "(no conclusion)"', () => {
    const ann = makeAnnotation({
      run: { ...makeAnnotation().run, conclusion: null },
    });
    expect(strip(renderAnnotationsList([ann]))).toContain('(no conclusion)');
  });

  it('truncates message bodies that exceed the field cap', () => {
    const overflow = 250;
    const ann = makeAnnotation({ message: 'x'.repeat(MAX_RENDERED_FIELD_CHARS + overflow) });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).toContain(`(truncated, ${overflow.toString()} more characters`);
    // The body itself is exactly the cap; the count of `x` characters should
    // equal MAX_RENDERED_FIELD_CHARS.
    expect((out.match(/x/g) ?? []).length).toBe(MAX_RENDERED_FIELD_CHARS);
  });

  it('truncates rawDetails when oversized', () => {
    const overflow = 100;
    const ann = makeAnnotation({
      rawDetails: 'r'.repeat(MAX_RENDERED_FIELD_CHARS + overflow),
    });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).toContain('Raw details:');
    expect(out).toContain(`(truncated, ${overflow.toString()} more characters`);
  });

  it('does not mark under-cap fields as truncated', () => {
    const ann = makeAnnotation({ message: 'short message', rawDetails: 'short details' });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).not.toContain('truncated');
  });

  it('truncates on a code-point boundary (surrogate pair straddling the cap)', () => {
    // Build a message where MAX_RENDERED_FIELD_CHARS-1 falls on the high
    // surrogate of an emoji pair. The clamp must back off by one and
    // leave a valid string (no unpaired high surrogate at the tail).
    const padding = 'a'.repeat(MAX_RENDERED_FIELD_CHARS - 1);
    const ann = makeAnnotation({ message: `${padding}\u{1F600}tail` });
    const out = strip(renderAnnotationsList([ann]));
    expect(out).toContain('truncated');
    // The rendered body should end on the last 'a' (the surrogate pair is
    // trimmed off the boundary), not on a lone high surrogate. Detect by
    // ensuring no isolated high surrogate (U+D800..U+DBFF) appears without
    // a following low surrogate. Raw UTF-16 reads via charCodeAt are
    // intentional here — codePointAt would mask the very thing we're
    // checking.
    /* eslint-disable unicorn/prefer-code-point -- raw UTF-16 inspection */
    for (let i = 0; i < out.length; i += 1) {
      const code = out.charCodeAt(i);
      if (code >= 0xd8_00 && code <= 0xdb_ff) {
        const next = out.charCodeAt(i + 1);
        expect(next >= 0xdc_00 && next <= 0xdf_ff).toBe(true);
      }
    }
    /* eslint-enable unicorn/prefer-code-point */
  });
});
