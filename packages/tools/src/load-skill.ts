import {z} from 'zod';
import {createTool} from './common.js';
import {SKILL_CATALOG_ACTIVATE_HINT} from './skills/format.js';

export const loadSkillTool = createTool({
  name: 'load_skill',
  description: `激活 Skill 并将指引注入上下文。${SKILL_CATALOG_ACTIVATE_HINT} 已激活则返回提示。`,
  schema: z.object({
    name: z.string().describe('Skill 名称或目录名。')
  }),
  async execute(input, context) {
    if (!context.ensureSkillLoaded) {
      throw new Error('load_skill 需要在 Agent 上下文中执行');
    }

    return context.ensureSkillLoaded(input.name);
  }
});
