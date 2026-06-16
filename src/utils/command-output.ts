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

export async function runCommand(
  operation: () => Promise<CommandResult>,
  timeoutMessage?: string
): Promise<string> {
  try {
    return formatCommandOutput(await operation(), timeoutMessage);
  } catch (error) {
    return formatCommandOutput(error as CommandResult, timeoutMessage);
  }
}
