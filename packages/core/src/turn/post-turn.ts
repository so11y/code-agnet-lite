import {supportsToolLoop, type CodeAgent} from '../code-agent.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode} from '../reasoning-mode.js';
import {agentProviders} from '../provider/provider-registry.js';
import {VerifyCoordinator} from '../verify/verify-coordinator.js';

export async function runPostTurnVerify(
  agent: CodeAgent,
  session: AgentSession,
  mode: ReasoningMode
): Promise<void> {
  session.throwIfAborted();

  const review = await VerifyCoordinator.judgeGate(session);

  if (!review.gate.shouldVerify) {
    session.events.status('done', '完成');
    return;
  }

  const fixAgent = supportsToolLoop(agent)
    ? agent
    : agentProviders.resolve('openai').provide(session);
  await new VerifyCoordinator(session.cwd, session.turnSignal()).runFixLoop(
    fixAgent,
    session,
    review,
    mode
  );
}
