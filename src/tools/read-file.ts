import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {resolveInsideCwd} from '../utils/path-safe.js';
import {truncate} from '../utils/truncate.js';
import {createTool} from './common.js';

export const readFileTool = createTool({
  name: 'read_file',
  description: 'Read a UTF-8 text file from the workspace.',
  schema: z.object({
    path: z.string().describe('File path relative to the workspace root.')
  }),
  async execute(input, context) {
    const filePath = resolveInsideCwd(context.cwd, input.path);
    const content = await readFile(filePath, 'utf8');
    return truncate(content);
  }
});
