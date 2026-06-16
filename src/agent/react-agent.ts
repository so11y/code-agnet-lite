import type {
  ChatCompletion,
  ChatCompletionMessageToolCall
} from 'openai/resources/chat/completions';
import {withTimeout} from '../utils/async.js';
import {getAssistantMessage, parseToolArgs} from '../utils/openai-message.js';
import {truncate} from '../utils/truncate.js';
import {AgentSession} from './session.js';
import type {AgentMessage, AgentOptions, AgentTool, ToolCallItem} from './types.js';

export abstract class ReActAgent {
  protected readonly maxSteps: number;
  protected readonly session: AgentSession;

  constructor(protected readonly options: AgentOptions) {
    this.maxSteps = options.maxSteps ?? 20;
    this.session = new AgentSession(options);
  }

  async run() {
    this.session.say('user', this.options.input);

    for (let step = 1; step <= this.maxSteps; step += 1) {
      this.session.status('thinking', `${step}/${this.maxSteps}`);

      const message = getAssistantMessage(await this.callLlm(this.session.messages));
      this.session.addAssistant(message);

      if (!message.tool_calls?.length) {
        this.session.status('done', 'Done');
        return;
      }

      for (const toolCall of message.tool_calls) {
        await this.runTool(toolCall);
      }
    }

    this.session.status('error', `Stopped after ${this.maxSteps} steps without a final answer.`);
  }

  protected abstract callLlm(messages: AgentMessage[]): Promise<ChatCompletion>;

  protected abstract findTool(name: string): AgentTool | undefined;

  protected toolTimeoutMs() {
    return 60_000;
  }

  private async runTool(toolCall: ChatCompletionMessageToolCall) {
    const input = parseToolArgs(toolCall);
    const call: ToolCallItem = {id: toolCall.id, name: toolCall.function.name, input};
    const tool = this.findTool(call.name);

    this.session.startTool(call);

    if (!tool) {
      this.failTool(call.id, `Unknown tool: ${call.name}`);
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
