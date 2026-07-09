import {commandExitCode, executeShellCommand, formatCommandOutput} from '@code-agent-lite/shared';
import type {VerifyResult} from './types.js';

export async function runVerifyCommand(cwd: string, command: string): Promise<VerifyResult> {
  const result = await executeShellCommand(command, {cwd});

  return {
    command,
    exitCode: commandExitCode(result),
    output: formatCommandOutput(result)
  };
}

export async function runAllVerify(cwd: string, commands: string[]): Promise<VerifyResult[]> {
  const failures: VerifyResult[] = [];

  for (const command of commands) {
    const result = await runVerifyCommand(cwd, command);
    if (result.exitCode !== 0) {
      failures.push(result);
    }
  }

  return failures;
}
