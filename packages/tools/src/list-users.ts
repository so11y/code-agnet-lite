import {z} from 'zod';
import {createTool} from './common.js';

export const listUsersTool = createTool({
  name: 'list_users',
  description: '返回全部用户。',
  schema: z.object({}),
  async execute(_input, _context) {
    return '暂无用户数据。';
  }
});
