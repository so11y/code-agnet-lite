import type {Skill} from '../skill-registry.js';
import type {AgentSession} from '../session.js';

export type TurnSkillResult = {
  cleanedInput: string;
  loaded: Skill[];
  missingSkill?: string;
};

export function applySkillsToSession(session: AgentSession, skills: Skill[]): Skill[] {
  const injected: Skill[] = [];

  for (const skill of skills) {
    if (session.skills.inject(skill)) {
      injected.push(skill);
    }
  }

  return injected;
}

export async function resolveAndInjectTurnSkills(
  session: AgentSession,
  input: string,
  cwd: string
): Promise<TurnSkillResult> {
  const parsed = session.skills.parseInput(input);
  const result: TurnSkillResult = {cleanedInput: parsed.cleanedInput, loaded: []};

  if (!parsed.skillName) {
    return result;
  }

  const skill = await session.skills.load(cwd, parsed.skillName);
  if (!skill) {
    result.missingSkill = parsed.skillName;
    return result;
  }

  result.loaded = applySkillsToSession(session, [skill]);
  return result;
}
