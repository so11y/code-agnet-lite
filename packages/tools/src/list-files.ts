import fg from 'fast-glob';
import {z} from 'zod';
import {truncate} from '@code-agent-lite/shared';
import {createTool, DEFAULT_IGNORE_GLOBS} from './common.js';

export const listFilesTool = createTool({
  name: 'list_files',
  description: '使用 glob 模式列出工作区中的文件。',
  schema: z.object({
    pattern: z.string().optional().describe('glob 模式，默认为 **/*。')
  }),
  async execute(input, context) {
    const files = await fg(input.pattern ?? '**/*', {
      cwd: context.cwd,
      onlyFiles: true,
      dot: true,
      ignore: [...DEFAULT_IGNORE_GLOBS]
    });

    return truncate(files.join('\n') || '未找到文件。');
  }
});
