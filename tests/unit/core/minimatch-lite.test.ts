import { describe, expect, it } from 'vitest';
import {
  globToRegex,
  matchesAny,
  workflowMatchesFilter,
} from '../../../src/core/minimatch-lite.js';

describe('globToRegex', () => {
  it('matches simple patterns', () => {
    expect(globToRegex('ci.yml').test('ci.yml')).toBe(true);
    expect(globToRegex('ci.yml').test('release.yml')).toBe(false);
  });

  it('* matches within a path segment only', () => {
    expect(globToRegex('*.yml').test('ci.yml')).toBe(true);
    expect(globToRegex('*.yml').test('subdir/ci.yml')).toBe(false);
  });

  it('** matches across segments', () => {
    expect(globToRegex('.github/**/ci.yml').test('.github/workflows/ci.yml')).toBe(true);
  });
});

describe('matchesAny', () => {
  it('returns false when the glob list is empty', () => {
    expect(matchesAny('whatever', [])).toBe(false);
  });

  it('returns true when ANY glob matches', () => {
    expect(matchesAny('release.yml', ['ci.yml', 'release.*'])).toBe(true);
  });
});

const filter = (include: string[], exclude: string[] = []) => ({ include, exclude });

describe('workflowMatchesFilter', () => {
  it('returns true when include is empty and not excluded', () => {
    expect(workflowMatchesFilter('CI', '.github/workflows/ci.yml', filter([]))).toBe(true);
  });

  it('matches by workflow name', () => {
    expect(workflowMatchesFilter('CI', '.github/workflows/ci.yml', filter(['CI']))).toBe(true);
  });

  it('matches by basename of the path', () => {
    expect(workflowMatchesFilter('CI', '.github/workflows/ci.yml', filter(['ci.yml']))).toBe(true);
  });

  it('exclude wins over include', () => {
    expect(workflowMatchesFilter('CI', '.github/workflows/ci.yml', filter(['*'], ['ci.yml']))).toBe(
      false,
    );
  });

  it('returns false when include is set but nothing matches', () => {
    expect(workflowMatchesFilter('CI', '.github/workflows/ci.yml', filter(['release.*']))).toBe(
      false,
    );
  });
});
