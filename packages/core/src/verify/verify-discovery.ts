import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export function resolveVerifyCommandsFromProject(options: {
  scripts?: Record<string, string>;
  hasTsconfig: boolean;
}): string[] {
  const commands: string[] = [];
  const test = options.scripts?.test;

  if (test && !/no test specified/i.test(test)) {
    commands.push('npm test');
  }

  if (options.scripts?.typecheck) {
    commands.push('npm run typecheck');
  }

  if (options.hasTsconfig && !commands.some((command) => command.includes('typecheck'))) {
    commands.push('npx tsc --noEmit');
  }

  return commands;
}

export async function discoverVerifyCommands(cwd: string): Promise<string[]> {
  const pkgPath = path.join(cwd, 'package.json');
  let scripts: Record<string, string> | undefined;

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
        scripts?: Record<string, string>;
      };
      scripts = pkg.scripts;
    } catch {
      // ignore malformed package.json
    }
  }

  return resolveVerifyCommandsFromProject({
    scripts,
    hasTsconfig: existsSync(path.join(cwd, 'tsconfig.json'))
  });
}
