import type {CodeAgent} from '../code-agent.js';
import type {ReasoningRoute} from '../router.js';
import type {AgentSession} from '../session.js';

export type ExecuteResult = {
  /** true 时跳过后续 execute 与 closeTurn（如 DAG 已完整结束） */
  done: boolean;
};

export type PluginTurnContext = {
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

  buildStart?(ctx: PluginTurnContext): void | Promise<void>;
  transformInput?(input: string, ctx: PluginTurnContext): string | void | Promise<string | void>;
  resolveMode?(input: string, ctx: PluginTurnContext): ReasoningRoute | null | void | Promise<ReasoningRoute | null | void>;
  prepareAgent?(ctx: PluginTurnContext): void | Promise<void>;
  execute?(ctx: PluginTurnContext): ExecuteResult | void | Promise<ExecuteResult | void>;
  closeTurn?(ctx: PluginTurnContext): void | Promise<void>;
};

export function createPluginTurnContext(session: AgentSession, input: string, cwd: string): PluginTurnContext {
  return {session, cwd, input, meta: new Map()};
}
