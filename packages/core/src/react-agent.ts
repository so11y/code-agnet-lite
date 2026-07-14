import type {ChatCompletionAssistantMessageParam, ChatCompletionMessageToolCall} from 'openai/resources/chat/completions';
import {parseToolArgs} from './openai-message.js';
import {buildWrapUpPrompt, WRAP_UP_THRESHOLD} from './prompt.js';
import {formatError, normalizeToolResult, truncate, TurnAbortedError, withTimeout} from '@code-agent-lite/shared';
import {formatSkillLoadResult} from '@code-agent-lite/tools';
import {AgentSession} from './session.js';
import type {AgentMessage, AgentSessionOptions, LlmStreamOptions, ToolCallItem} from './session-types.js';
import type {AgentTool} from '@code-agent-lite/tools';

export type AgentRunResult = {
  completed: boolean;
  steps: number;
  reason: 'final_answer' | 'max_steps';
};

export abstract class ReActAgent {
  protected readonly maxSteps: number;
  protected readonly session: AgentSession;

  constructor(protected readonly options: AgentSessionOptions, session: AgentSession) {
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
      this.session.throwIfAborted();

      const remaining = this.maxSteps - step + 1;
      this.session.events.status('thinking', `${step}/${this.maxSteps}`);

      if (remaining <= WRAP_UP_THRESHOLD) {
        this.session.conversation.addSystemNote(buildWrapUpPrompt(remaining), {emit: false});
      }

      let streamed = false;
      let streamedThinking = false;

      const message = await this.streamLlm(this.buildLlmMessages(), {
        ...this.session.llmOptions(),
        onReasoningDelta: (delta) => {
          if (!streamedThinking) {
            this.session.events.startThinkingStream();
            streamedThinking = true;
          }

          this.session.events.appendThinkingDelta(delta);
        },
        onDelta: (delta) => {
          if (!streamed) {
            if (streamedThinking) {
              this.session.events.endThinkingStream();
              streamedThinking = false;
            }

            this.session.events.startAssistantStream();
            streamed = true;
          }

          this.session.events.appendAssistantDelta(delta);
        }
      });

      if (streamedThinking) {
        this.session.events.endThinkingStream();
      }

      this.session.conversation.commitAssistant(message, streamed);

      if (!message.tool_calls?.length) {
        return {completed: true, steps: step, reason: 'final_answer'};
      }

      for (const toolCall of message.tool_calls) {
        this.session.throwIfAborted();
        await this.runTool(toolCall);
      }
    }

    return {completed: false, steps: this.maxSteps, reason: 'max_steps'};
  }

  protected abstract streamLlm(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<ChatCompletionAssistantMessageParam>;

  protected abstract findTool(name: string): AgentTool | undefined;

  protected toolTimeoutMs() {
    return 60_000;
  }

  protected async runTool(toolCall: ChatCompletionMessageToolCall) {
    const input = parseToolArgs(toolCall);
    const call: ToolCallItem = {id: toolCall.id, name: toolCall.function.name, input};
    const tool = this.findTool(call.name);

    this.session.events.startTool(call);

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

    try {
      const {output, display} = normalizeToolResult(
        await withTimeout(
          tool.execute(parsed.data, {
            cwd: this.session.cwd,
            setCwd: (cwd) => this.session.setWorkspace(cwd),
            signal: this.session.turnSignal(),
            ensureSkillLoaded: async (name) => {
              const outcome = await this.session.skills.ensureLoaded(this.session.cwd, name);
              if (!outcome) {
                return this.session.skills.registry.formatNotFound(name);
              }

              return formatSkillLoadResult(outcome.skill.name, outcome.injected);
            }
          }),
          this.toolTimeoutMs(),
          this.session.turnSignal()
        )
      );
      this.session.ledger.recordToolCall(call.name, parsed.data);
      this.session.conversation.finishTool(call.id, truncate(output), {
        display,
        toolName: call.name,
        toolInput: call.input
      });
    } catch (error) {
      if (error instanceof TurnAbortedError) {
        throw error;
      }

      this.failTool(call.id, formatError(error));
    }
  }

  protected async beforeToolExecute(_name: string, _input: unknown): Promise<boolean> {
    return true;
  }

  private failTool(id: string, message: string) {
    this.session.conversation.finishTool(id, message, {error: message});
  }
}
