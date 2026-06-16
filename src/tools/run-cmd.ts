import {execaCommand} from 'execa';
import {z} from 'zod';
import {formatCommandOutput, type CommandResult} from '../utils/command-output.js';
import {createTool} from './common.js';

export const runCmdTool = createTool({
  name: 'run_cmd',
  description: 'Run a shell command in the current workspace directory.',
  schema: z.object({
    command: z.string().describe('Shell command to run in the current workspace.')
  }),
  async execute(input, context) {
    try {
      const result = await execaCommand(input.command, {
        cwd: context.cwd,
        shell: true,
        reject: false
      });

      return formatCommandOutput(result);
    } catch (error) {
      return formatCommandOutput(error as CommandResult);
    }
  }
});
