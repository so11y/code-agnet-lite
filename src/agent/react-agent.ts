import type {
  ChatCompletion,
  ChatCompletionMessageToolCall
} from 'openai/resources/chat/completions';
import {withTimeout} from '../utils/async.js';
import {getAssistantMessage, parseToolArgs} from '../utils/openai-message.js';
import {truncate} from '../utils/truncate.js';
import {AgentSession} from './session.js';
import type {AgentMessage, AgentOptions, AgentTool, ToolCallItem} from './types.js';

export type AgentRunResult = {
  completed: boolean;
  steps: number;
  reason: 'final_answer' | 'max_steps';
};

export type AgentLifecyclePhase = 'before' | 'after';

export type AgentLifecycleContext = {
  session: AgentSession;
  result?: AgentRunResult;
  error?: unknown;
};

export type AgentLifecycleHook = (context: AgentLifecycleContext) => Promise<void> | void;

export abstract class ReActAgent {
  protected readonly maxSteps: number;
  protected readonly session: AgentSession;
  private readonly lifecycleHooks = new Map<AgentLifecyclePhase, AgentLifecycleHook[]>();

  constructor(protected readonly options: AgentOptions, session?: AgentSession) {
    this.maxSteps = options.maxSteps ?? 20;
    this.session = session ?? new AgentSession(options);
  }

  on(phase: AgentLifecyclePhase, hook: AgentLifecycleHook) {
    const hooks = this.lifecycleHooks.get(phase) ?? [];
    hooks.push(hook);
    this.lifecycleHooks.set(phase, hooks);
    return this;
  }

  async run(): Promise<AgentRunResult> {
    await this.emitLifecycle('before');

    let result: AgentRunResult | undefined;
    let error: unknown;

    try {
      result = await this.runLoop();
    } catch (caught) {
      error = caught;
    }

    await this.emitLifecycle('after', {result, error});

    if (error) {
      throw error;
    }

    return result ?? {completed: false, steps: 0, reason: 'max_steps'};
  }

  private async runLoop(): Promise<AgentRunResult> {
    this.session.announceUser();

    for (let step = 1; step <= this.maxSteps; step += 1) {
      this.session.status('thinking', `${step}/${this.maxSteps}`);

      const message = getAssistantMessage(await this.callLlm(this.session.messages));
      this.session.addAssistant(message);

      if (!message.tool_calls?.length) {
        this.session.status('done', '完成');
        return {completed: true, steps: step, reason: 'final_answer'};
      }

      for (const toolCall of message.tool_calls) {
        await this.runTool(toolCall);
      }
    }

    this.session.status('error', `已执行 ${this.maxSteps} 步，但仍未得到最终回答。`);
    return {completed: false, steps: this.maxSteps, reason: 'max_steps'};
  }

  protected abstract callLlm(messages: AgentMessage[]): Promise<ChatCompletion>;

  protected abstract findTool(name: string): AgentTool | undefined;

  protected toolTimeoutMs() {
    return 60_000;
  }

  private async emitLifecycle(
    phase: AgentLifecyclePhase,
    context: Omit<AgentLifecycleContext, 'session'> = {}
  ) {
    const hooks = this.lifecycleHooks.get(phase) ?? [];

    for (const hook of hooks) {
      await hook({session: this.session, ...context});
    }
  }

  private async runTool(toolCall: ChatCompletionMessageToolCall) {
    const input = parseToolArgs(toolCall);
    const call: ToolCallItem = {id: toolCall.id, name: toolCall.function.name, input};
    const tool = this.findTool(call.name);

    this.session.startTool(call);

    if (!tool) {
      this.failTool(call.id, `未知工具：${call.name}`);
      return;
    }

    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      this.failTool(call.id, parsed.error.message);
      return;
    }

    try {
      const output = await withTimeout(
        tool.execute(parsed.data, {
          cwd: this.session.cwd,
          setCwd: (cwd) => this.session.setWorkspace(cwd)
        }),
        this.toolTimeoutMs()
      );
      this.session.finishTool(call.id, truncate(output));
    } catch (error) {
      this.failTool(call.id, error instanceof Error ? error.message : String(error));
    }
  }

  private failTool(id: string, message: string) {
    this.session.finishTool(id, message, message);
  }
}
