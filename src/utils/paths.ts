import path from 'node:path';

export function toPosixPath(p: string): string {
  if (path.sep === '/') return p;
  /* c8 ignore next — Windows-only branch, not exercised on POSIX CI runners. */
  return p.split(path.sep).join('/');
}
