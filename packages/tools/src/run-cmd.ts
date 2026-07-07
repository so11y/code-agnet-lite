import {execaCommand} from 'execa';
import {z} from 'zod';
import {runCommand} from '@code-agent-lite/shared';
import {createTool} from './common.js';

export const runCmdTool = createTool({
  name: 'run_cmd',
  description: '在当前工作区目录中运行 shell 命令。',
  schema: z.object({
    command: z.string().describe('要在当前工作区中执行的 shell 命令。')
  }),
  async execute(input, context) {
    return runCommand(() =>
      execaCommand(input.command, {
        cwd: context.cwd,
        shell: true,
        reject: false
      })
    );
  }
});
