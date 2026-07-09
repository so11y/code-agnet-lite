import {isReActAgent, type CodeAgent} from '../code-agent.js';
import type {AgentSession} from '../session.js';
import {agentProviders} from '../provider/provider-registry.js';
import {judgeShouldVerify, runVerifyAndFixLoop} from '../verify/index.js';

export async function runPostTurnVerify(agent: CodeAgent, session: AgentSession): Promise<void> {
  session.throwIfAborted();

  const review = await judgeShouldVerify(session);

  if (!review.gate.shouldVerify) {
    session.events.status('done', '完成');
    return;
  }

  const fixAgent = isReActAgent(agent) ? agent : agentProviders.resolve('openai').provide(session);
  await runVerifyAndFixLoop(fixAgent, session, review);
}
