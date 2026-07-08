import type {ChatCompletionAssistantMessageParam, ChatCompletionMessageToolCall} from 'openai/resources/chat/completions';
import {parseToolArgs} from './openai-message.js';
import {truncate, withTimeout} from '@code-agent-lite/shared';
import {AgentSession} from './session.js';
import type {AgentMessage, AgentOptions, ToolCallItem} from './session-types.js';
import type {AgentTool} from '@code-agent-lite/tools';

export type AgentRunResult = {
  completed: boolean;
  steps: number;
  reason: 'final_answer' | 'max_steps';
};

export abstract class ReActAgent {
  protected readonly maxSteps: number;
  protected readonly session: AgentSession;

  constructor(protected readonly options: AgentOptions, session: AgentSession) {
    this.maxSteps = options.maxSteps ?? 20;
    this.session = session;
  }

  async run(): Promise<AgentRunResult> {
    return this.runLoop();
  }

  protected buildLlmMessages(): AgentMessage[] {
    return this.session.buildLlmMessages();
  }

  private async runLoop(): Promise<AgentRunResult> {
    for (let step = 1; step <= this.maxSteps; step += 1) {
      this.session.status('thinking', `${step}/${this.maxSteps}`);

      let streamed = false;
      const message = await this.streamLlm(this.buildLlmMessages(), (delta) => {
        if (!streamed) {
          this.session.startAssistantStream();
          streamed = true;
        }

        this.session.appendAssistantDelta(delta);
      });
      this.session.commitAssistant(message, streamed);

      if (!message.tool_calls?.length) {
        return {completed: true, steps: step, reason: 'final_answer'};
      }

      for (const toolCall of message.tool_calls) {
        await this.runTool(toolCall);
      }
    }

    return {completed: false, steps: this.maxSteps, reason: 'max_steps'};
  }

  protected abstract streamLlm(
    messages: AgentMessage[],
    onDelta: (delta: string) => void
  ): Promise<ChatCompletionAssistantMessageParam>;

  protected abstract findTool(name: string): AgentTool | undefined;

  protected toolTimeoutMs() {
    return 60_000;
  }

  protected async runTool(toolCall: ChatCompletionMessageToolCall) {
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

    if (!(await this.beforeToolExecute(call.name, parsed.data))) {
      this.failTool(call.id, '工具调用被 Worker 策略拒绝');
      return;
    }

    this.session.recordToolCall(call.name, parsed.data);

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

  protected async beforeToolExecute(_name: string, _input: unknown): Promise<boolean> {
    return true;
  }

  private failTool(id: string, message: string) {
    this.session.finishTool(id, message, message);
  }
}
