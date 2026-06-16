import path from 'node:path';
import {z} from 'zod';
import {isDirectory} from '../utils/workspace.js';
import {createTool} from './common.js';

export const setWorkspaceTool = createTool({
  name: 'set_workspace',
  description: 'Change the current workspace directory for subsequent tool calls.',
  schema: z.object({
    cwd: z.string().describe('Absolute or relative directory path to switch to.')
  }),
  async execute(input, context) {
    const resolved = path.resolve(context.cwd, input.cwd);

    if (!(await isDirectory(resolved))) {
      throw new Error(`Workspace is not a directory: ${resolved}`);
    }

    context.setCwd(resolved);
    return `Workspace changed to ${resolved}`;
  }
});
