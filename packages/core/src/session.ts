import {throwIfAborted} from '@code-agent-lite/shared';

import {
  createStateDeltaProjectorState,
  flushStateDelta,
  type StateDeltaProjectorState
} from './state-delta-projector.js';

import {
  type AgentMessage,
  type AgentSessionOptions,
  type LlmOptions,
  type ReasoningMode
} from './session-types.js';

import {createDefaultToolRegistry, type ToolRegistry} from './tool-registry.js';

import {Skills} from './skills/skills.js';

import {ConversationStore} from './session/conversation-store.js';

import {SessionEventBus} from './session/event-bus.js';

import {TurnLedger} from './session/turn-ledger.js';

import {PluginDriver} from './plugin/driver.js';

import {defaultPlugins} from './plugin/builtins.js';

import {createPluginSessionContext, HookStrategy, PluginHook} from './plugin/types.js';

export type OpenAgentSessionOptions = Omit<AgentSessionOptions, 'plugins'> & {
  plugins?: AgentSessionOptions['plugins'];
};

export class AgentSession {
  static current: AgentSession | null = null;

  cwd: string;

  reasoningMode?: ReasoningMode;

  readonly toolRegistry: ToolRegistry;

  readonly skills: Skills;

  readonly events: SessionEventBus;

  readonly conversation: ConversationStore;

  readonly ledger: TurnLedger;

  private readonly pluginDriver_: PluginDriver;

  private readonly stateProjector_: StateDeltaProjectorState = createStateDeltaProjectorState();

  private turnSignal_?: AbortSignal;

  constructor(readonly options: AgentSessionOptions) {
    this.cwd = options.cwd;

    this.toolRegistry = options.tools ?? createDefaultToolRegistry();

    this.events = new SessionEventBus(options.onEvent);

    this.conversation = new ConversationStore(options.cwd, this.events);

    this.skills = Skills.create(this.conversation, options.skills);

    this.ledger = new TurnLedger();

    this.pluginDriver_ = new PluginDriver(options.plugins ?? defaultPlugins());
  }

  static async open(options: AgentSessionOptions): Promise<AgentSession> {
    const session = new AgentSession(options);

    await session.pluginDriver_.runHook(
      PluginHook.SessionReady,
      HookStrategy.Void,
      createPluginSessionContext(session)
    );

    return session;
  }

  static async openSingleton(options: OpenAgentSessionOptions): Promise<AgentSession> {
    if (AgentSession.current) {
      return AgentSession.current;
    }

    AgentSession.current = await AgentSession.open({
      ...options,
      plugins: options.plugins ?? defaultPlugins()
    });
    return AgentSession.current;
  }

  static async closeSingleton(): Promise<void> {
    await AgentSession.current?.dispose();
  }

  async dispose(): Promise<void> {
    await this.pluginDriver_.runHook(
      PluginHook.SessionDispose,
      HookStrategy.Void,
      createPluginSessionContext(this)
    );

    if (AgentSession.current === this) {
      AgentSession.current = null;
    }
  }

  async runPluginTurn(input: string, cwd?: string): Promise<void> {
    await this.pluginDriver_.run(input, cwd ?? this.cwd, this);
  }

  setTurnSignal(signal?: AbortSignal) {
    this.turnSignal_ = signal;
  }

  turnSignal(): AbortSignal | undefined {
    return this.turnSignal_;
  }

  throwIfAborted() {
    throwIfAborted(this.turnSignal_);
  }

  llmOptions(): LlmOptions {
    return {session: this, signal: this.turnSignal_};
  }

  flushStateDelta() {
    flushStateDelta(
      this.stateProjector_,
      this.ledger.state,
      this.ledger.refreshOperations(),
      (content) => this.conversation.addSystemNote(content)
    );
  }

  buildLlmMessages(): AgentMessage[] {
    this.flushStateDelta();

    return this.conversation.messages;
  }

  ensureWorkspace(cwd?: string): Promise<string> {
    const target = cwd ?? this.cwd;

    if (target !== this.cwd) {
      return this.changeWorkspace_(target);
    }

    return Promise.resolve(target);
  }

  async setWorkspace(cwd: string): Promise<void> {
    if (cwd === this.cwd) {
      return;
    }

    await this.changeWorkspace_(cwd);
  }

  private changeWorkspace_(cwd: string): Promise<string> {
    const prev = this.cwd;

    this.cwd = cwd;

    this.events.setWorkspace(cwd);

    return this.pluginDriver_
      .runHook(PluginHook.WorkspaceChange, HookStrategy.Void, createPluginSessionContext(this), prev)
      .then(() => cwd);
  }
}
