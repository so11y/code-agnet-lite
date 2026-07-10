import type {AgentSession} from '../session.js';
import {formatSkillLoadResult} from '@code-agent-lite/tools';

export async function prepareTurn(session: AgentSession, input: string, cwd: string): Promise<string> {
  await session.ensureWorkspace(cwd);

  const parsed = session.skills.registry.parseInput(input);

  if (parsed.skillName) {
    const outcome = await session.skills.ensureLoaded(cwd, parsed.skillName);
    if (!outcome) {
      session.events.say('system', session.skills.registry.formatNotFound(parsed.skillName));
    } else if (outcome.injected) {
      session.events.say('system', formatSkillLoadResult(outcome.skill.name, true));
    }
  }

  session.ledger.beginTurn(parsed.cleanedInput);
  session.conversation.appendUser(parsed.cleanedInput, {emit: false});
  return parsed.cleanedInput;
}