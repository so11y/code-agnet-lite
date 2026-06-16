import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {resolveInsideCwd} from '../utils/path-safe.js';
import {createTool} from './common.js';

export const writeFileTool = createTool({
  name: 'write_file',
  description: '写入工作区内的 UTF-8 文本文件，会覆盖整个文件。',
  schema: z.object({
    path: z.string().describe('相对于工作区根目录的文件路径。'),
    content: z.string().describe('完整的新文件内容。')
  }),
  async execute(input, context) {
    const filePath = resolveInsideCwd(context.cwd, input.path);
    await mkdir(path.dirname(filePath), {recursive: true});
    await writeFile(filePath, input.content, 'utf8');
    return `已写入 ${input.content.length} 个字符到 ${input.path}`;
  }
});
