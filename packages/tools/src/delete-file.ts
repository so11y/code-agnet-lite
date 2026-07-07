import {stat, unlink} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {resolveInsideCwd} from '@code-agent-lite/shared';
import {createTool} from './common.js';

const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules']);

function assertDeletable(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) {
    throw new Error(`不允许删除受保护路径：${relativePath}`);
  }

  if (path.basename(normalized) === '.env') {
    throw new Error(`不允许删除受保护文件：${relativePath}`);
  }
}

export const deleteFileTool = createTool({
  name: 'delete_file',
  description: '删除工作区内的单个文件。不要用于删除目录；不要用 shell 命令删文件。',
  schema: z.object({
    path: z.string().describe('相对于工作区根目录的文件路径。')
  }),
  async execute(input, context) {
    assertDeletable(input.path);

    const filePath = resolveInsideCwd(context.cwd, input.path);
    const info = await stat(filePath);

    if (!info.isFile()) {
      throw new Error(`路径不是文件：${input.path}`);
    }

    await unlink(filePath);
    return `已删除 ${input.path}`;
  }
});
