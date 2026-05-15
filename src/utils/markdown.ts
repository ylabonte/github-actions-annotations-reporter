const HTML_COMMENT_CLOSE_PATTERN = /-->/g;

export function escapeHtmlCommentBody(input: string): string {
  return input.replaceAll(HTML_COMMENT_CLOSE_PATTERN, '-- >');
}

export function blockQuote(input: string): string {
  return input
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
