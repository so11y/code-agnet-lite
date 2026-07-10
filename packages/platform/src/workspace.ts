import path from 'node:path';
import {stat} from 'node:fs/promises';

export const parseNewSessionCommand = (input: string) =>
  /^(?:\/new|\/clear)\s*$/i.test(input.trim());

export async function isDirectory(targetPath: string) {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

export async function assertDirectory(targetPath: string, label = '工作区'): Promise<string> {
  const resolved = path.resolve(targetPath);

  if (!(await isDirectory(resolved))) {
    throw new Error(`${label}不是有效目录：${resolved}`);
  }

  return resolved;
}

export async function resolveWorkspaceDirectory(baseCwd: string, target: string): Promise<string> {
  return assertDirectory(path.resolve(baseCwd, target));
}
