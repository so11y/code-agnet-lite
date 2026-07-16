import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import type {AgentTool} from '@code-agent-lite/tools';
import {AgentRunReason, ReActAgent} from '../src/react-agent.js';
import {AgentSession} from '../src/session.js';
import type {AgentMessage, AssistantMessage, LlmStreamOptions} from '../src/session-types.js';

class TwoStepAgent extends ReActAgent {
  readonly allowTools: Array<boolean | undefined> = [];
  private calls = 0;

  protected async streamLlm(
    _messages: AgentMessage[],
    options: LlmStreamOptions
  ): Promise<AssistantMessage> {
    this.allowTools.push(options.allowTools);
    this.calls += 1;
    return this.calls === 1
      ? {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'read-1',
              toolName: 'read_file',
              input: {path: 'package.json'}
            }
          ]
        }
      : {role: 'assistant', content: 'done'};
  }

  protected findTool(name: string): AgentTool | undefined {
    return name === tool.name ? tool : undefined;
  }
}

const tool: AgentTool = {
  name: 'read_file',
  description: 'read',
  schema: z.object({path: z.string()}),
  async execute() {
    return {output: 'contents'};
  }
};

describe('ReActAgent', () => {
  it('reserves the last step for a tool-free final answer', async () => {
    const session = new AgentSession({cwd: '/project', maxSteps: 2, onEvent() {}});
    session.beginTurn('check package.json');
    const agent = new TwoStepAgent({maxSteps: 2}, session);

    await expect(agent.run()).resolves.toEqual({
      steps: 2,
      reason: AgentRunReason.FinalAnswer
    });
    expect(agent.allowTools).toEqual([true, false]);
  });
});
