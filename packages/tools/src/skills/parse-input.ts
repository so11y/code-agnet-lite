const SKILL_PREFIX_RE = /^\/skill\s+([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i;
const SKILL_AT_RE = /^@skill:([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i;

export type ParsedSkillInput = {
  skillName?: string;
  cleanedInput: string;
};

export function parseSkillInput(input: string): ParsedSkillInput {
  const trimmed = input.trim();
  const prefixMatch = SKILL_PREFIX_RE.exec(trimmed) ?? SKILL_AT_RE.exec(trimmed);

  if (!prefixMatch) {
    return {cleanedInput: input};
  }

  const task = prefixMatch[2]?.trim();
  return {
    skillName: prefixMatch[1],
    cleanedInput: task || '请按照已加载 Skill 的指引完成任务。'
  };
}
