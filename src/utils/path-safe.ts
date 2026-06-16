import path from 'node:path';

export function resolveInsideCwd(cwd: string, targetPath: string): string {
  const resolvedCwd = path.resolve(cwd);
  const resolvedTarget = path.resolve(resolvedCwd, targetPath);
  const relative = path.relative(resolvedCwd, resolvedTarget);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedTarget;
  }

  throw new Error(`Path escapes workspace: ${targetPath}`);
}
