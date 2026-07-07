import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {resolveInsideCwd, truncate} from '@code-agent-lite/shared';
import {createTool} from './common.js';

export const readFileTool = createTool({
  name: 'read_file',
  description: '读取工作区内的 UTF-8 文本文件。',
  schema: z.object({
    path: z.string().describe('相对于工作区根目录的文件路径。')
  }),
  async execute(input, context) {
    const filePath = resolveInsideCwd(context.cwd, input.path);
    const content = await readFile(filePath, 'utf8');
    return truncate(content);
  }
});
