/**
 * Neutralize every form of HTML/Markdown comment terminator that could
 * accidentally close one of our `<!-- annot-... -->` markers when an
 * annotation message or `raw_details` is interpolated into the issue
 * body.
 *
 * Strategy: every run of two or more consecutive `-` characters has a
 * zero-width space (U+200B) inserted between each adjacent pair. This
 * breaks every known comment-close sequence in one pass:
 *
 *   `-->`  → `-‍-‍>`   (HTML4/HTML5 canonical close — neutralized)
 *   `--!>` → `-‍-‍!>`  (HTML5 alternative close — neutralized)
 *   `--->` → `-‍-‍-‍>` (collapses by some parsers to `-->` — neutralized)
 *   `----` → `-‍-‍-‍-` (defensive — no terminator, but covers spec drift)
 *
 * Single isolated `-` characters are left alone. Result is fully visible
 * (ZWSP renders as nothing in most fonts), so display fidelity is
 * preserved.
 */
export function escapeHtmlCommentBody(input: string): string {
  return input.replaceAll(/--+/g, (run) =>
    Array.from({ length: run.length }, () => '-').join('​'),
  );
}

export function blockQuote(input: string): string {
  return input
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
