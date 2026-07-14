import {throwIfAborted} from '@code-agent-lite/shared';

import {
  createStateDeltaProjectorState,
  flushStateDelta,
  resetTurnOperationsProjection,
  type StateDeltaProjectorState
} from './state-delta-projector.js';
import {
  type AgentMessage,
  type AgentSessionOptions,
  type LlmOptions
} from './session-types.js';
import {createDefaultToolRegistry, type ToolRegistry} from './tool-registry.js';
import {createDefaultSkillRegistry} from './skill-registry.js';
import {Skills} from './skills/skills.js';
import {ConversationStore} from './session/conversation-store.js';
import {SessionEventBus} from './session/event-bus.js';
import {TurnLedger} from './session/turn-ledger.js';
import {PluginDriver} from './plugin/driver.js';
import {defaultPlugins} from './plugin/builtins.js';
import {createPluginSessionContext, HookStrategy, PluginHook} from './plugin/types.js';

type ChildSessionOptions = {
  maxSteps: number;
  onEvent: AgentSessionOptions['onEvent'];
  systemPrompt: string;
  systemNotes?: string[];
};

export class AgentSession {
  static current: AgentSession | null = null;

  readonly toolRegistry: ToolRegistry;
  readonly skills: Skills;
  readonly events: SessionEventBus;
  readonly conversation: ConversationStore;
  readonly ledger: TurnLedger;
  readonly config: Readonly<Omit<AgentSessionOptions, 'cwd'>>;

  private readonly pluginDriver: PluginDriver;
  private readonly stateProjector: StateDeltaProjectorState = createStateDeltaProjectorState();
  private currentCwd: string;
  private currentTurnSignal?: AbortSignal;

  constructor(options: AgentSessionOptions) {
    const {cwd, ...config} = options;
    this.currentCwd = cwd;
    this.config = config;
    this.toolRegistry = options.tools ?? createDefaultToolRegistry();
    this.events = new SessionEventBus(options.onEvent);
    this.conversation = new ConversationStore(cwd, this.events);
    this.skills = new Skills(options.skills ?? createDefaultSkillRegistry(), this.conversation);
    this.ledger = new TurnLedger();
    this.pluginDriver = new PluginDriver(options.plugins ?? defaultPlugins());
  }

  get cwd(): string {
    return this.currentCwd;
  }

  createChild(options: ChildSessionOptions): AgentSession {
    const child = new AgentSession({
      ...this.config,
      cwd: this.cwd,
      maxSteps: options.maxSteps,
      onEvent: options.onEvent,
      plugins: []
    });
    child.currentTurnSignal = this.currentTurnSignal;
    child.conversation.resetWorkspace(child.cwd, options.systemPrompt);
    child.skills.inheritLoaded(this.skills);

    for (const note of options.systemNotes ?? []) {
      child.conversation.addSystemNote(note, {emit: false});
    }

    return child;
  }

  static async open(options: AgentSessionOptions): Promise<AgentSession> {
    const session = new AgentSession(options);

    await session.pluginDriver.runHook(
      PluginHook.SessionReady,
      HookStrategy.Void,
      createPluginSessionContext(session)
    );

    return session;
  }

  static async openSingleton(options: AgentSessionOptions): Promise<AgentSession> {
    if (AgentSession.current) {
      return AgentSession.current;
    }

    AgentSession.current = await AgentSession.open(options);
    return AgentSession.current;
  }

  static async closeSingleton(): Promise<void> {
    await AgentSession.current?.dispose();
  }

  async dispose(): Promise<void> {
    await this.pluginDriver.runHook(
      PluginHook.SessionDispose,
      HookStrategy.Void,
      createPluginSessionContext(this)
    );

    if (AgentSession.current === this) {
      AgentSession.current = null;
    }
  }

  async runPluginTurn(input: string, cwd?: string): Promise<void> {
    await this.pluginDriver.run(input, cwd ?? this.cwd, this);
  }

  setTurnSignal(signal?: AbortSignal) {
    this.currentTurnSignal = signal;
  }

  turnSignal(): AbortSignal | undefined {
    return this.currentTurnSignal;
  }

  throwIfAborted() {
    throwIfAborted(this.currentTurnSignal);
  }

  llmOptions(): LlmOptions {
    return {session: this, signal: this.currentTurnSignal};
  }

  flushStateDelta() {
    flushStateDelta(
      this.stateProjector,
      this.ledger.state,
      (content) => this.conversation.addSystemNote(content)
    );
  }

  beginTurn(userInput: string) {
    this.ledger.beginTurn(userInput);
    resetTurnOperationsProjection(this.stateProjector);
  }

  buildLlmMessages(): AgentMessage[] {
    this.flushStateDelta();

    return this.conversation.messages;
  }

  ensureWorkspace(cwd?: string): Promise<string> {
    const target = cwd ?? this.cwd;

    if (target !== this.cwd) {
      this.conversation.resetWorkspace(target);
      this.ledger.resetWorkspace();
      Object.assign(this.stateProjector, createStateDeltaProjectorState());
      return this.changeWorkspace(target);
    }

    return Promise.resolve(target);
  }

  async setWorkspace(cwd: string): Promise<void> {
    if (cwd === this.cwd) {
      return;
    }

    await this.changeWorkspace(cwd);
  }

  private async changeWorkspace(cwd: string): Promise<string> {
    const prev = this.cwd;
    this.currentCwd = cwd;
    this.conversation.setWorkspace(cwd);
    this.events.setWorkspace(cwd);
    await this.pluginDriver.runHook(
      PluginHook.WorkspaceChange,
      HookStrategy.Void,
      createPluginSessionContext(this),
      prev
    );
    return cwd;
  }
}
