import {execaCommand} from 'execa';
import {compact} from 'lodash-es';
import {truncate} from './truncate.js';

export type CommandResult = {
  exitCode?: number;
  code?: string;
  stdout?: string;
  stderr?: string;
  shortMessage?: string;
  timedOut?: boolean;
};

export function formatCommandOutput(result: CommandResult, timeoutMessage?: string) {
  const parts = compact([result.stdout, result.stderr, result.shortMessage]);
  const exit = result.exitCode ?? result.code ?? '未知';
  const timeout = result.timedOut && timeoutMessage ? `\n${timeoutMessage}` : '';

  return truncate(`退出码：${exit}${timeout}\n${parts.join('\n') || '无输出。'}`);
}

export function commandExitCode(result: CommandResult): number {
  return Number(result.exitCode ?? result.code ?? 1);
}

export async function executeShellCommand(
  command: string,
  options: {cwd: string; signal?: AbortSignal}
): Promise<CommandResult> {
  return execaCommand(command, {
    cwd: options.cwd,
    shell: true,
    reject: false,
    cancelSignal: options.signal
  }) as Promise<CommandResult>;
}

export async function runProcess(
  operation: () => Promise<CommandResult>
): Promise<CommandResult> {
  try {
    return await operation();
  } catch (error) {
    return error as CommandResult;
  }
}

export async function runCommand(
  operation: () => Promise<CommandResult>,
  timeoutMessage?: string
): Promise<string> {
  return formatCommandOutput(await runProcess(operation), timeoutMessage);
}
