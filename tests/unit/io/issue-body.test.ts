import { describe, expect, it } from 'vitest';
import {
  MAX_TITLE_LENGTH,
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

  it('parses occurrences with alternate date/url separators (markdown normalization tolerance)', () => {
    // The renderer emits an em-dash `—`, but a Markdown linter, a human
    // editor, or a templating bot can normalize punctuation. Accept the
    // common variants so a round-trip of a managed issue doesn't lose its
    // occurrence history.
    const body = [
      '### Recent occurrences',
      '',
      '- 2026-05-15 — [run #1](https://example/runs/1)',
      '- 2026-05-14 – [run #2](https://example/runs/2)', // en-dash U+2013
      '- 2026-05-13 - [run #3](https://example/runs/3)', // hyphen-minus
      '- 2026-05-12 -- [run #4](https://example/runs/4)', // double hyphen
      '',
      '---',
    ].join('\n');
    expect(parseOccurrences(body)).toEqual([
      { date: '2026-05-15', runUrl: 'https://example/runs/1', runNumber: 1 },
      { date: '2026-05-14', runUrl: 'https://example/runs/2', runNumber: 2 },
      { date: '2026-05-13', runUrl: 'https://example/runs/3', runNumber: 3 },
      { date: '2026-05-12', runUrl: 'https://example/runs/4', runNumber: 4 },
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

  it('renderIssueTitle clamps the assembled title to the API-safe length', () => {
    // Long path + long head: head truncates to 100 chars, but path is
    // unbounded. Without the final-assembled clamp, the result could
    // exceed GitHub's 256-char limit and the API call would 422. Verify
    // the assembled title stays at or under MAX_TITLE_LENGTH (240).
    const longPath = 'deeply/nested/' + 'segment/'.repeat(20) + 'file.ts';
    const longMessage = 'a'.repeat(150);
    const annotation = makeAnnotation({ path: longPath, message: longMessage, title: null });
    const title = renderIssueTitle(annotation);
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
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
