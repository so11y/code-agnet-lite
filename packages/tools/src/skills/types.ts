export const SKILLS_DIR = '.agent/skills';

export type SkillMeta = {
  name: string;
  description: string;
  dirName: string;
};

export type Skill = SkillMeta & {
  body: string;
  path: string;
};
