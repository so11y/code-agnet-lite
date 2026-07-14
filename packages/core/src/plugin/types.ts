import type {CodeAgent} from '../code-agent.js';
import type {ReasoningRoute} from '../router.js';
import type {AgentSession} from '../session.js';
import type {TurnExecution} from '../turn/execute-mode.js';

export type PluginSessionContext = {
  session: AgentSession;
  cwd: string;
};

export type PluginTurnContext = {
  session: AgentSession;
  targetCwd: string;
  input: string;
  route?: ReasoningRoute;
  agent?: CodeAgent;
  execution?: TurnExecution;
};

export enum PluginHook {
  SessionReady = 'sessionReady',
  WorkspaceChange = 'workspaceChange',
  SessionDispose = 'sessionDispose',
  BuildStart = 'buildStart',
  TransformInput = 'transformInput',
  ResolveMode = 'resolveMode',
  PrepareAgent = 'prepareAgent',
  Execute = 'execute',
  CloseTurn = 'closeTurn'
}

/** void=忽略；all=收集；first=首个有效值（Rollup resolve）；last=末个有效值；reduce=管道传递首参 */
export enum HookStrategy {
  Void = 'void',
  All = 'all',
  First = 'first',
  Last = 'last',
  Reduce = 'reduce'
}

type MaybePromise<T> = T | Promise<T>;

export type AgentPlugin = {
  name: string;
  enforce?: 'pre' | 'post';

  sessionReady?(ctx: PluginSessionContext): MaybePromise<unknown>;
  workspaceChange?(ctx: PluginSessionContext, prevCwd: string): MaybePromise<unknown>;
  sessionDispose?(ctx: PluginSessionContext): MaybePromise<unknown>;

  buildStart?(ctx: PluginTurnContext): MaybePromise<unknown>;
  transformInput?(input: string, ctx: PluginTurnContext): MaybePromise<string | void>;
  resolveMode?(input: string, ctx: PluginTurnContext): MaybePromise<ReasoningRoute | null | void>;
  prepareAgent?(ctx: PluginTurnContext): MaybePromise<unknown>;
  execute?(ctx: PluginTurnContext): MaybePromise<unknown>;
  closeTurn?(ctx: PluginTurnContext): MaybePromise<unknown>;
};

export function createPluginSessionContext(session: AgentSession): PluginSessionContext {
  return {session, cwd: session.cwd};
}

export function createPluginTurnContext(session: AgentSession, input: string, cwd: string): PluginTurnContext {
  return {session, targetCwd: cwd, input};
}
