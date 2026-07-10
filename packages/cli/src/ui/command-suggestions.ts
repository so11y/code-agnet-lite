import type {SkillMeta} from '@code-agent-lite/core';

export type CommandHint = {
  command: string;
  description: string;
  example?: string;
};

export const STATIC_COMMANDS: CommandHint[] = [
  {command: '/new', description: '开始新对话'},
  {command: '/clear', description: '清空当前对话'},
  {command: '/skill', description: '加载 Skill 并执行任务', example: '/skill name 任务描述'}
];

export type SuggestionContext =
  | {type: 'commands'; filter: string}
  | {type: 'skills'; filter: string};

export function parseSuggestionContext(input: string): SuggestionContext | null {
  if (!input.startsWith('/')) {
    return null;
  }

  const afterSlash = input.slice(1);
  const skillMatch = /^skill(?:\s+(\S*))?$/i.exec(afterSlash);

  if (skillMatch) {
    return {type: 'skills', filter: (skillMatch[1] ?? '').toLowerCase()};
  }

  return {type: 'commands', filter: afterSlash.toLowerCase()};
}

export function filterCommands(filter: string): CommandHint[] {
  if (!filter) {
    return STATIC_COMMANDS;
  }

  return STATIC_COMMANDS.filter(
    (item) =>
      item.command.slice(1).toLowerCase().startsWith(filter) ||
      item.command.toLowerCase().includes(filter)
  );
}

export function filterSkills(skills: SkillMeta[], filter: string): SkillMeta[] {
  if (!filter) {
    return skills;
  }

  return skills.filter(
    (skill) =>
      skill.name.toLowerCase().startsWith(filter) ||
      skill.dirName.toLowerCase().startsWith(filter)
  );
}

export type SuggestionItem =
  | {type: 'command'; hint: CommandHint}
  | {type: 'skill'; skill: SkillMeta};

export function getSuggestions(input: string, skills: SkillMeta[]): SuggestionItem[] {
  const context = parseSuggestionContext(input);
  if (!context) {
    return [];
  }

  if (context.type === 'commands') {
    return filterCommands(context.filter).map((hint) => ({type: 'command', hint}));
  }

  return filterSkills(skills, context.filter).map((skill) => ({type: 'skill', skill}));
}

export function applySuggestion(item: SuggestionItem): string {
  if (item.type === 'command') {
    return `${item.hint.command} `;
  }

  return `/skill ${item.skill.name} `;
}
