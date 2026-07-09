import {z} from 'zod';
import {resolveWorkspaceDirectory} from '@code-agent-lite/platform';
import {createTool} from './common.js';

export const setWorkspaceTool = createTool({
  name: 'set_workspace',
  description: '切换后续工具调用的当前工作区目录。',
  schema: z.object({
    cwd: z.string().describe('要切换到的绝对或相对目录路径。')
  }),
  async execute(input, context) {
    const resolved = await resolveWorkspaceDirectory(context.cwd, input.cwd);

    context.setCwd(resolved);
    return `工作区已切换至 ${resolved}`;
  }
});
