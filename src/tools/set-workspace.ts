import path from 'node:path';
import {z} from 'zod';
import {isDirectory} from '../utils/workspace.js';
import {createTool} from './common.js';

export const setWorkspaceTool = createTool({
  name: 'set_workspace',
  description: '切换后续工具调用的当前工作区目录。',
  schema: z.object({
    cwd: z.string().describe('要切换到的绝对或相对目录路径。')
  }),
  async execute(input, context) {
    const resolved = path.resolve(context.cwd, input.cwd);

    if (!(await isDirectory(resolved))) {
      throw new Error(`工作区不是有效目录：${resolved}`);
    }

    context.setCwd(resolved);
    return `工作区已切换至 ${resolved}`;
  }
});
