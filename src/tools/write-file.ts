import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {resolveInsideCwd} from '../utils/path-safe.js';
import {createTool} from './common.js';

export const writeFileTool = createTool({
  name: 'write_file',
  description: 'Write a UTF-8 text file inside the workspace. This replaces the whole file.',
  schema: z.object({
    path: z.string().describe('File path relative to the workspace root.'),
    content: z.string().describe('Complete new file content.')
  }),
  async execute(input, context) {
    const filePath = resolveInsideCwd(context.cwd, input.path);
    await mkdir(path.dirname(filePath), {recursive: true});
    await writeFile(filePath, input.content, 'utf8');
    return `Wrote ${input.content.length} chars to ${input.path}`;
  }
});
