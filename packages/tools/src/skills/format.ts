import type {Skill, SkillMeta} from './types.js';
import {SKILLS_DIR} from './types.js';

export function formatSkillNotFound(name: string): string {
  return `未找到 Skill：${name}。可用 list_skills 查看。`;
}

export const SKILL_CATALOG_ACTIVATE_HINT =
  '执行用户任务、调用其他工具之前，须对照 Catalog 的 description；有匹配 Skill 则先调用 load_skill 激活。';

export function formatSkillLoadResult(name: string, injected: boolean): string {
  return injected
    ? `已加载 Skill：${name}`
    : `Skill「${name}」已加载，无需重复。`;
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

  return ['[Skill Catalog]', `以下为 Skill 索引（仅 name/description）。${SKILL_CATALOG_ACTIVATE_HINT}`, '', ...blocks].join('\n');
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
