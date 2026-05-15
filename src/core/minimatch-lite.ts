/**
 * Tiny glob matcher: `*` matches any non-slash characters; `**` matches across slashes.
 * Used to filter workflows by name or repo-relative path.
 */
export function globToRegex(glob: string): RegExp {
  let result = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === undefined) continue;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        result += '.*';
        i += 1;
      } else {
        result += '[^/]*';
      }
    } else if (ch === '?') {
      result += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      result += `\\${ch}`;
    } else {
      result += ch;
    }
  }
  result += '$';
  return new RegExp(result);
}

export function matchesAny(value: string, globs: readonly string[]): boolean {
  if (globs.length === 0) return false;
  for (const glob of globs) {
    if (globToRegex(glob).test(value)) return true;
  }
  return false;
}

export interface WorkflowFilter {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export function workflowMatchesFilter(
  workflowName: string,
  workflowPath: string,
  filter: WorkflowFilter,
): boolean {
  const candidates = [workflowName, workflowPath, basename(workflowPath)];
  if (filter.exclude.length > 0 && candidates.some((c) => matchesAny(c, filter.exclude))) {
    return false;
  }
  if (filter.include.length === 0) return true;
  return candidates.some((c) => matchesAny(c, filter.include));
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}
