import {z} from 'zod';
import {createTool} from './common.js';
import {discoverSkills, formatSkillList} from './skills/index.js';

export const listSkillsTool = createTool({
  name: 'list_skills',
  description: '列出当前工作区 .agent/skills/ 下可用的 Skill。',
  schema: z.object({}),
  async execute(_input, context) {
    const skills = await discoverSkills(context.cwd);
    return formatSkillList(skills);
  }
});
