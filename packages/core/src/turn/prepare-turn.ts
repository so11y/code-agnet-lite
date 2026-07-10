import type {AgentSession} from '../session.js';
import {resolveAndInjectTurnSkills} from '../skills/apply-turn-skills.js';
import {ensureSkillCatalog} from '../skills/skill-catalog.js';

export async function prepareTurn(session: AgentSession, input: string, cwd: string): Promise<string> {
  session.ensureWorkspace(cwd);
  await ensureSkillCatalog(session, cwd);

  const {cleanedInput, loaded, missingSkill} = await resolveAndInjectTurnSkills(session, input, cwd);

  if (missingSkill) {
    session.events.say('system', session.skillRegistry.formatNotFound(missingSkill));
  } else if (loaded.length) {
    session.events.say('system', `已加载 Skill：${loaded.map((skill) => skill.name).join(', ')}`);
  }

  session.beginTurn(cleanedInput);
  session.appendUser(cleanedInput, {emit: false});
  return cleanedInput;
}
