/**
 * Skill 能力的 DI 门面：默认实现委托给 @code-agent-lite/tools。
 * 保留此层是为了在测试或 CLI 中注入 mock SkillRegistry（见 AgentSessionOptions.skills），
 * 业务逻辑不应在此重复实现 Skill 解析/加载。
 */
import {
  discoverSkills,
  formatSkillCatalog,
  formatSkillForPrompt,
  formatSkillNotFound,
  loadSkill,
  parseSkillInput,
  type ParsedSkillInput,
  type Skill,
  type SkillMeta
} from '@code-agent-lite/tools';

export type {Skill, SkillMeta};
export type SkillRegistry = {
  parseInput(input: string): ParsedSkillInput;
  load(cwd: string, name: string): Promise<Skill | undefined>;
  discover(cwd: string): Promise<SkillMeta[]>;
  formatCatalog(skills: SkillMeta[]): string;
  formatNotFound(name: string): string;
  formatForPrompt(skill: Skill): string;
};

export function createDefaultSkillRegistry(): SkillRegistry {
  return {
    parseInput: parseSkillInput,
    load: async (cwd, name) => (await loadSkill(cwd, name)) ?? undefined,
    discover: discoverSkills,
    formatCatalog: (skills) => formatSkillCatalog(skills) ?? '',
    formatNotFound: formatSkillNotFound,
    formatForPrompt: formatSkillForPrompt
  };
}
