import type {AgentSession} from '../session.js';
import {VerifyCoordinator} from './verify-coordinator.js';

export async function judgeShouldVerify(session: AgentSession) {
  return VerifyCoordinator.judgeGate(session);
}
