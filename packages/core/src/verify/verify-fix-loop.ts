import type {ReActAgent} from '../react-agent.js';
import type {AgentSession} from '../session.js';
import type {TurnReview} from '../session-types.js';
import {VerifyCoordinator} from './verify-coordinator.js';

export async function runVerifyAndFixLoop(
  agent: ReActAgent,
  session: AgentSession,
  review: TurnReview
): Promise<void> {
  await new VerifyCoordinator(session.cwd).runFixLoop(agent, session, review);
}
