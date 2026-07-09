import {throwIfAborted} from '@code-agent-lite/shared';
import type {AgentRule} from '@code-agent-lite/tools';
import type {Skill} from './skill-registry.js';
import {createDefaultSkillRegistry, type SkillRegistry} from './skill-registry.js';
import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {StateDeltaProjector} from './state-delta-projector.js';
import {
  type AgentMessage,
  type AgentSessionOptions,
  type InternalState,
  type LlmOptions,
  type ReasoningMode,
  type TokenUsage,
  type TurnOperations,
  type TurnSummary
} from './session-types.js';
import {createDefaultToolRegistry, type ToolRegistry} from './tool-registry.js';
import {ConversationStore} from './session/conversation-store.js';
import {SessionEventBus} from './session/event-bus.js';
import {TurnLedger} from './session/turn-ledger.js';
import type {FinishToolOptions} from './session/finish-tool-options.js';

export class AgentSession {
  cwd: string;
  reasoningMode?: ReasoningMode;
  readonly toolRegistry: ToolRegistry;
  readonly skillRegistry: SkillRegistry;
  private readonly events_: SessionEventBus;
  private readonly conversation_: ConversationStore;
  private readonly ledger_: TurnLedger;
  private readonly stateProjector_ = new StateDeltaProjector();
  private turnSignal_?: AbortSignal;
  private loadedSkillNames_ = new Set<string>();
  private loadedRuleIds_ = new Set<string>();

  constructor(readonly options: AgentSessionOptions) {
    this.cwd = options.cwd;
    this.toolRegistry = options.tools ?? createDefaultToolRegistry();
    this.skillRegistry = options.skills ?? createDefaultSkillRegistry();
    this.events_ = new SessionEventBus(options.onEvent);
    this.conversation_ = new ConversationStore(options.cwd, this.events_);
    this.ledger_ = new TurnLedger();
  }

  get messages(): AgentMessage[] {
    return this.conversation_.messages;
  }

  get state(): InternalState {
    return this.ledger_.state;
  }

  get tokenUsage(): TokenUsage {
    return this.events_.tokenUsage;
  }

  get events(): SessionEventBus {
    return this.events_;
  }

  beginTurn(userInput: string) {
    this.ledger_.beginTurn(userInput);
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

  appendUser(content: string, options?: {emit?: boolean}) {
    this.conversation_.appendUser(content, options);
  }

  flushStateDelta() {
    this.stateProjector_.flush(this.ledger_.state, this.ledger_.refreshOperations(), (content) =>
      this.addSystemNote(content)
    );
  }

  buildLlmMessages(): AgentMessage[] {
    this.flushStateDelta();
    return this.messages;
  }

  applyHypotheses(hypotheses: string[]) {
    this.ledger_.applyHypotheses(hypotheses);
  }

  rejectHypotheses(hypotheses: string[]) {
    this.ledger_.rejectHypotheses(hypotheses);
  }

  addFacts(facts: string[]) {
    this.ledger_.addFacts(facts);
  }

  recordToolCall(name: string, input: unknown) {
    this.ledger_.recordToolCall(name, input);
  }

  extractLastAssistantText(): string {
    return this.conversation_.extractLastAssistantText();
  }

  refreshOperations(): TurnOperations {
    return this.ledger_.refreshOperations();
  }

  collectTurnSummary(): TurnSummary {
    return this.ledger_.collectTurnSummary(this.extractLastAssistantText());
  }

  snapshotProgress() {
    return this.ledger_.snapshotProgress();
  }

  noteProgress(before: ReturnType<AgentSession['snapshotProgress']>) {
    this.ledger_.noteProgress(before);
  }

  ensureWorkspace(cwd?: string): string {
    const target = cwd ?? this.cwd;

    if (target !== this.cwd) {
      this.setWorkspace(target);
    }

    return target;
  }

  commitAssistant(message: ChatCompletionAssistantMessageParam, streamed: boolean) {
    this.conversation_.commitAssistant(message, streamed);
  }

  addAssistant(message: ChatCompletionAssistantMessageParam) {
    this.conversation_.addAssistant(message);
  }

  addSystemNote(content: string, options?: {emit?: boolean}) {
    this.conversation_.addSystemNote(content, options);
  }

  hasLoadedSkill(name: string): boolean {
    return this.loadedSkillNames_.has(name);
  }

  injectSkill(skill: Skill) {
    this.loadedSkillNames_.add(skill.name);
    this.addSystemNote(this.skillRegistry.formatForPrompt(skill), {emit: true});
  }

  hasLoadedRule(id: string): boolean {
    return this.loadedRuleIds_.has(id);
  }

  injectRule(rule: AgentRule) {
    this.loadedRuleIds_.add(rule.id);
    this.conversation_.injectRule(rule);
  }

  setSkillCatalog(content: string, cwd: string) {
    this.conversation_.setSkillCatalog(content, cwd);
  }

  clearSkillCatalog() {
    this.conversation_.clearSkillCatalog();
  }

  finishTool(id: string, content: string, options?: FinishToolOptions) {
    this.conversation_.finishTool(id, content, options);
  }

  setWorkspace(cwd: string) {
    this.cwd = cwd;
    this.events_.setWorkspace(cwd);
  }
}

export function createAgentSession(options: AgentSessionOptions): AgentSession {
  return new AgentSession(options);
}
