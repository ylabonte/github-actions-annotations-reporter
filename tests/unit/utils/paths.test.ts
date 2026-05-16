import { describe, expect, it } from 'vitest';
import { toPosixPath } from '../../../src/utils/paths.js';

describe('toPosixPath', () => {
  it('returns POSIX paths unchanged', () => {
    expect(toPosixPath('a/b/c')).toBe('a/b/c');
  });
});
