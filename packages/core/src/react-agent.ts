import type {AgentTool} from '@code-agent-lite/tools';
import {formatSkillLoadResult} from '@code-agent-lite/tools';
import {
  formatError,
  normalizeToolResult,
  truncate,
  TurnAbortedError,
  withTimeout
} from '@code-agent-lite/shared';
import {buildWrapUpPrompt, WRAP_UP_THRESHOLD} from './prompt.js';
import {AgentSession} from './session.js';
import type {
  AgentMessage,
  AgentSessionOptions,
  AssistantMessage,
  LlmStreamOptions,
  ToolCall,
  ToolCallItem
} from './session-types.js';

export type AgentRunResult = {
  steps: number;
  reason: 'final_answer' | 'max_steps';
};

function messageToolCalls(message: AssistantMessage): ToolCall[] {
  return typeof message.content === 'string'
    ? []
    : message.content.filter((part): part is ToolCall => part.type === 'tool-call');
}

export abstract class ReActAgent {
  protected readonly maxSteps: number;
  protected readonly session: AgentSession;

  constructor(options: Pick<AgentSessionOptions, 'maxSteps'>, session: AgentSession) {
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
      const toolCalls = messageToolCalls(message);

      if (!toolCalls.length) {
        return {steps: step, reason: 'final_answer'};
      }

      for (const toolCall of toolCalls) {
        this.session.throwIfAborted();
        await this.runTool(toolCall);
      }
    }

    return {steps: this.maxSteps, reason: 'max_steps'};
  }

  protected abstract streamLlm(
    messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<AssistantMessage>;

  protected abstract findTool(name: string): AgentTool | undefined;

  protected toolTimeoutMs() {
    return 60_000;
  }

  protected async runTool(toolCall: ToolCall) {
    const call: ToolCallItem = {
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      input: toolCall.input
    };
    const tool = this.findTool(call.name);

    this.session.events.startTool(call);

    if (!tool) {
      this.failTool(call, `未知工具：${call.name}`);
      return;
    }

    const parsed = tool.schema.safeParse(call.input);
    if (!parsed.success) {
      this.failTool(call, parsed.error.message);
      return;
    }

    if (!(await this.beforeToolExecute(call.name, parsed.data))) {
      this.failTool(call, '工具调用被 Worker 策略拒绝');
      return;
    }

    try {
      const {output, display} = normalizeToolResult(
        await withTimeout(
          (signal) =>
            tool.execute(parsed.data, {
              cwd: this.session.cwd,
              setCwd: (cwd) => this.session.setWorkspace(cwd),
              signal,
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
      this.failTool(call, formatError(error));
    }
  }

  protected async beforeToolExecute(_name: string, _input: unknown): Promise<boolean> {
    return true;
  }

  private failTool(call: ToolCallItem, message: string) {
    this.session.conversation.finishTool(call.id, message, {
      error: message,
      toolName: call.name,
      toolInput: call.input
    });
  }
}
