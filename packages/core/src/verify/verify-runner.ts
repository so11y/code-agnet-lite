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
  const results = await Promise.all(commands.map((command) => runVerifyCommand(cwd, command)));
  return results.filter((result) => result.exitCode !== 0);
}
