import {execa} from 'execa';
import type {CommandResult} from '@code-agent-lite/shared';
import {runProcess} from '@code-agent-lite/shared';

export async function runArgvCommand(
  file: string,
  args: string[],
  options: {cwd: string; signal?: AbortSignal; timeout?: number}
): Promise<CommandResult> {
  return runProcess(() =>
    execa(file, args, {
      cwd: options.cwd,
      reject: false,
      timeout: options.timeout,
      cancelSignal: options.signal
    }) as Promise<CommandResult>
  );
}
