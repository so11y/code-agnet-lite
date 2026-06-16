import fg from 'fast-glob';
import {z} from 'zod';
import {truncate} from '../utils/truncate.js';
import {createTool} from './common.js';

export const listFilesTool = createTool({
  name: 'list_files',
  description: 'List files in the workspace using a glob pattern.',
  schema: z.object({
    pattern: z.string().optional().describe('Glob pattern. Defaults to **/*.')
  }),
  async execute(input, context) {
    const files = await fg(input.pattern ?? '**/*', {
      cwd: context.cwd,
      onlyFiles: true,
      dot: true,
      ignore: ['node_modules/**', 'dist/**', '.git/**']
    });

    return truncate(files.join('\n') || 'No files found.');
  }
});
