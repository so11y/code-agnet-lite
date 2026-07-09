import {z} from 'zod';
import {createTool} from './common.js';
import {formatSkillForPrompt, formatSkillNotFound, loadSkill} from './skills/index.js';

export const loadSkillTool = createTool({
  name: 'load_skill',
  description: '加载 Skill 完整指引。当 Skill Catalog 中某个 description 与当前任务匹配时使用。',
  schema: z.object({
    name: z.string().describe('Skill 名称或目录名。')
  }),
  async execute(input, context) {
    const skill = await loadSkill(context.cwd, input.name);
    if (!skill) {
      return formatSkillNotFound(input.name);
    }

    return formatSkillForPrompt(skill);
  }
});
