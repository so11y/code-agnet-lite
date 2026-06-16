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
  const parts = [result.stdout, result.stderr, result.shortMessage].filter(Boolean);
  const exit = result.exitCode ?? result.code ?? 'unknown';
  const timeout = result.timedOut && timeoutMessage ? `\n${timeoutMessage}` : '';

  return truncate(`exit: ${exit}${timeout}\n${parts.join('\n') || 'No output.'}`);
}
