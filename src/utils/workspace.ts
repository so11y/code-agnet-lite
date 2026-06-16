import {stat} from 'node:fs/promises';
import path from 'node:path';
import {compact} from 'lodash-es';

export const parseWorkspaceCommand = (input: string) =>
  /^(?:\/(?:workspace|cwd)|cd)\s+(.+)$/i.exec(input.trim())?.[1]?.trim();

export const parseNewSessionCommand = (input: string) =>
  /^(?:\/new|\/clear)\s*$/i.test(input.trim());

export function absolutePathCandidates(input: string) {
  const quoted = [...input.matchAll(/["']([a-zA-Z]:[\\/][^"']+)["']/g)].map(
    (match) => match[1]
  );
  const bare = input.match(/[a-zA-Z]:[\\/][^\s"'<>|?*,.;!?]*/g) ?? [];

  return compact(
    [...quoted, ...bare].map((candidate) => candidate.replace(/[)\]}.!?]+$/g, ''))
  );
}

export async function isDirectory(targetPath: string) {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

export async function firstDirectory(paths: string[]) {
  for (const candidate of paths) {
    const resolved = path.resolve(candidate);
    if (await isDirectory(resolved)) {
      return resolved;
    }
  }
}
