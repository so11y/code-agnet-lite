import {formatSessionTranscript} from './openai-message.js';
import type {AgentSession} from './session.js';

export function formatTurnContext(session: AgentSession): string {
  return formatSessionTranscript(session.buildLlmMessages());
}
