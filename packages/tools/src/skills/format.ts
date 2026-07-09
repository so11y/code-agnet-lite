import type {Skill, SkillMeta} from './types.js';
import {SKILLS_DIR} from './types.js';

export function formatSkillNotFound(name: string): string {
  return `未找到 Skill：${name}。可用 list_skills 查看。`;
}

export function formatSkillForPrompt(skill: Skill): string {
  const lines = [`[Skill: ${skill.name}]`];

  if (skill.description) {
    lines.push(skill.description);
  }

  if (skill.body) {
    lines.push('', skill.body);
  }

  return lines.join('\n');
}

export function formatSkillCatalog(skills: SkillMeta[]): string | null {
  if (!skills.length) {
    return null;
  }

  const blocks = skills.map(
    (skill) => `---\nname: ${skill.name}\ndescription: ${skill.description || '（无描述）'}\n---`
  );

  return ['[Skill Catalog]', '任务匹配某 Skill 的 description 时，用 load_skill 加载正文。', '', ...blocks].join(
    '\n'
  );
}

export function formatSkillList(skills: SkillMeta[], cwd: string): string {
  if (!skills.length) {
    return `当前工作区未找到 Skill。可在 ${SKILLS_DIR}/<name>/SKILL.md 创建。`;
  }

  const lines = skills.map((skill) => {
    const desc = skill.description ? ` — ${skill.description}` : '';
    return `- ${skill.name}（${skill.dirName}）${desc}`;
  });

  return ['可用 Skill：', ...lines].join('\n');
}
