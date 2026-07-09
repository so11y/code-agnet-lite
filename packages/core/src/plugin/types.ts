import type {CodeAgent} from '../code-agent.js';
import type {ReasoningRoute} from '../router.js';
import type {AgentSession} from '../session.js';

export type ExecuteResult = {
  /** true 时跳过后续 execute 与 closeTurn（如 DAG 已完整结束） */
  done: boolean;
};

export type TurnContext = {
  session: AgentSession;
  cwd: string;
  input: string;
  route?: ReasoningRoute;
  agent?: CodeAgent;
  meta: Map<string, unknown>;
};

export type AgentPlugin = {
  name: string;
  enforce?: 'pre' | 'post';

  buildStart?(ctx: TurnContext): void | Promise<void>;
  transformInput?(input: string, ctx: TurnContext): string | void | Promise<string | void>;
  resolveMode?(input: string, ctx: TurnContext): ReasoningRoute | null | void | Promise<ReasoningRoute | null | void>;
  prepareAgent?(ctx: TurnContext): void | Promise<void>;
  execute?(ctx: TurnContext): ExecuteResult | void | Promise<ExecuteResult | void>;
  closeTurn?(ctx: TurnContext): void | Promise<void>;
};

export function createTurnContext(session: AgentSession, input: string, cwd: string): TurnContext {
  return {session, cwd, input, meta: new Map()};
}
