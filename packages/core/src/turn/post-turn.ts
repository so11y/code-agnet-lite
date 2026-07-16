import {supportsToolLoop, type CodeAgent} from '../code-agent.js';
import type {AgentSession} from '../session.js';
import type {ReasoningMode} from '../reasoning-mode.js';
import {AgentStatus, VerificationOutcome} from '../session-types.js';
import {agentProviders} from '../provider/agent-providers.js';
import {VerifyCoordinator} from '../verify/verify-coordinator.js';

export async function runPostTurnVerify(
  agent: CodeAgent,
  session: AgentSession,
  mode: ReasoningMode
): Promise<VerificationOutcome> {
  session.throwIfAborted();

  const review = await VerifyCoordinator.judgeGate(session);

  if (!review.gate.shouldVerify) {
    session.events.status(AgentStatus.Done, '完成');
    return VerificationOutcome.NotRequired;
  }

  const fixAgent = supportsToolLoop(agent)
    ? agent
    : agentProviders.resolve('openai').provide(session);
  return new VerifyCoordinator(session.cwd, session.turnSignal()).runFixLoop(
    fixAgent,
    session,
    review,
    mode
  );
}
