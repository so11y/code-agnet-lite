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
