import {
  discoverSkills,
  formatSkillCatalog,
  formatSkillForPrompt,
  formatSkillNotFound,
  loadSkill,
  parseSkillInput,
  type ParsedSkillInput
} from '@code-agent-lite/tools';

export type SkillMeta = {
  name: string;
  description: string;
  dirName: string;
};

export type Skill = SkillMeta & {
  body: string;
  path: string;
};

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
