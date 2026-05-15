import { describe, expect, it } from 'vitest';
import {
  parseFingerprintMarker,
  parseIssueState,
  parseOccurrences,
  renderIssueBody,
  renderIssueTitle,
} from '../../../src/io/issue-body.js';
import { makeAnnotation, makeIssueState } from '../../helpers/fixtures.js';

describe('renderIssueBody / parsers', () => {
  it('round-trips fingerprint marker', () => {
    const annotation = makeAnnotation();
    const body = renderIssueBody({
      fingerprint: annotation.fingerprint,
      annotation,
      state: makeIssueState({ workflowPath: annotation.workflow.path }),
      occurrences: [
        { date: '2026-05-15', runUrl: annotation.run.htmlUrl, runNumber: annotation.run.runNumber },
      ],
    });
    expect(parseFingerprintMarker(body)).toBe(annotation.fingerprint);
  });

  it('round-trips state marker (lastSeenAt, missCounter, firstSeenAt, workflowPath)', () => {
    const annotation = makeAnnotation();
    const state = makeIssueState({
      lastSeenAt: '2026-05-15T10:23:00.000Z',
      missCounter: 2,
      firstSeenAt: '2026-05-01T00:00:00.000Z',
      workflowPath: annotation.workflow.path,
    });
    const body = renderIssueBody({
      fingerprint: annotation.fingerprint,
      annotation,
      state,
      occurrences: [],
    });
    expect(parseIssueState(body)).toEqual(state);
  });

  it('parses occurrences in order', () => {
    const annotation = makeAnnotation();
    const body = renderIssueBody({
      fingerprint: annotation.fingerprint,
      annotation,
      state: makeIssueState(),
      occurrences: [
        { date: '2026-05-15', runUrl: 'https://example/runs/1', runNumber: 1 },
        { date: '2026-05-14', runUrl: 'https://example/runs/2', runNumber: 2 },
      ],
    });
    const parsed = parseOccurrences(body);
    expect(parsed).toEqual([
      { date: '2026-05-15', runUrl: 'https://example/runs/1', runNumber: 1 },
      { date: '2026-05-14', runUrl: 'https://example/runs/2', runNumber: 2 },
    ]);
  });

  it('parseFingerprintMarker returns null when missing', () => {
    expect(parseFingerprintMarker('no marker here')).toBeNull();
  });

  it('parseIssueState returns null for malformed bodies', () => {
    expect(parseIssueState('<!-- annot-state: not-json -->')).toBeNull();
    expect(parseIssueState('no state')).toBeNull();
  });

  it('parseIssueState tolerates a state payload with nested braces', () => {
    // Future-proofs the parser: a non-greedy `{...}` capture would have
    // stopped at the first inner `}` and tripped JSON.parse.
    const body = [
      '<!-- annot-state: {"lastSeenAt":"2026-05-15T00:00:00.000Z","missCounter":0,"firstSeenAt":"2026-05-01T00:00:00.000Z","workflowPath":".github/workflows/ci.yml","extra":{"nested":{"deep":1}}} -->',
    ].join('\n');
    expect(parseIssueState(body)).toEqual({
      lastSeenAt: '2026-05-15T00:00:00.000Z',
      missCounter: 0,
      firstSeenAt: '2026-05-01T00:00:00.000Z',
      workflowPath: '.github/workflows/ci.yml',
    });
  });

  it('renderIssueTitle truncates long messages', () => {
    const annotation = makeAnnotation({ message: 'x'.repeat(300) });
    const title = renderIssueTitle(annotation);
    expect(title.length).toBeLessThan(150);
    expect(title.endsWith('…')).toBe(true);
  });

  it('escapes HTML comment terminators in the message body', () => {
    const annotation = makeAnnotation({ message: 'before --> after' });
    const body = renderIssueBody({
      fingerprint: annotation.fingerprint,
      annotation,
      state: makeIssueState(),
      occurrences: [],
    });
    expect(body).not.toMatch(/^>\s*before -->/m);
    expect(body).toMatch(/before -- > after/);
  });
});
