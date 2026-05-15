import { describe, expect, it } from 'vitest';
import { renderAnnotationsList } from '../../../src/io/output/annotations-list.js';
import { makeAnnotation } from '../../helpers/fixtures.js';

function strip(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replaceAll(/\[[0-9;]*m/g, '');
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
});
