import type {AgentSession} from '../session.js';
import type {AgentProviderKind} from './types.js';

/** Agent 对话的内部 AI 抽象；OpenAI / Cursor 等 provider 返回各自实现。 */
export interface AgentAi {
  readonly kind: AgentProviderKind;
  runTurn(session: AgentSession, input: string, cwd: string): Promise<void>;
  disposeSession?(session: AgentSession): Promise<void>;
}
