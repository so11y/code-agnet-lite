import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {parseSkillMarkdown} from './frontmatter.js';
import type {Skill, SkillMeta} from './types.js';
import {SKILLS_DIR} from './types.js';

function skillsRoot(cwd: string): string {
  return path.join(cwd, SKILLS_DIR);
}

function toSkillMeta(dirName: string, meta: Record<string, string>): SkillMeta {
  return {
    dirName,
    name: meta.name?.trim() || dirName,
    description: meta.description?.trim() || ''
  };
}

function toSkill(dirName: string, filePath: string, meta: Record<string, string>, body: string): Skill {
  const base = toSkillMeta(dirName, meta);
  return {...base, body, path: filePath};
}

async function readSkillFile(filePath: string, dirName: string): Promise<Skill | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const {meta, body} = parseSkillMarkdown(raw);
    return toSkill(dirName, filePath, meta, body);
  } catch {
    return null;
  }
}

export async function discoverSkills(cwd: string): Promise<SkillMeta[]> {
  const root = skillsRoot(cwd);
  let entries: string[];

  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const skills: SkillMeta[] = [];

  for (const dirName of entries) {
    const dirPath = path.join(root, dirName);
    const info = await stat(dirPath).catch(() => null);
    if (!info?.isDirectory()) {
      continue;
    }

    const skill = await readSkillFile(path.join(dirPath, 'SKILL.md'), dirName);
    if (skill) {
      skills.push(skill);
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSkill(cwd: string, nameOrDir: string): Promise<Skill | null> {
  const query = nameOrDir.trim().toLowerCase();
  if (!query) {
    return null;
  }

  const skills = await discoverSkills(cwd);
  const match = skills.find(
    (skill) => skill.name.toLowerCase() === query || skill.dirName.toLowerCase() === query
  );

  if (!match) {
    return null;
  }

  return readSkillFile(path.join(skillsRoot(cwd), match.dirName, 'SKILL.md'), match.dirName);
}
