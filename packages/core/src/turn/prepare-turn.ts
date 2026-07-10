import type {AgentSession} from '../session.js';
import {resolveAndInjectTurnSkills} from '../skills/apply-turn-skills.js';

export async function prepareTurn(session: AgentSession, input: string, cwd: string): Promise<string> {
  await session.ensureWorkspace(cwd);

  const {cleanedInput, loaded, missingSkill} = await resolveAndInjectTurnSkills(session, input, cwd);

  if (missingSkill) {
    session.events.say('system', session.skills.formatNotFound(missingSkill));
  } else if (loaded.length) {
    session.events.say('system', `已加载 Skill：${loaded.map((skill) => skill.name).join(', ')}`);
  }

  session.ledger.beginTurn(cleanedInput);
  session.conversation.appendUser(cleanedInput, {emit: false});
  return cleanedInput;
}
