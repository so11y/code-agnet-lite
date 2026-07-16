import {afterEach, describe, expect, it, vi} from 'vitest';
import {simulateReadableStream} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {z} from 'zod';
import {OpenAiLlmProvider} from '../../src/provider/openai-provider.js';
import {AgentSession} from '../../src/session.js';
import type {AgentEvent} from '../../src/session-types.js';

const usage = {
  inputTokens: {total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0},
  outputTokens: {total: 4, text: 4, reasoning: 0}
};

describe('OpenAiLlmProvider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the injected model id for context usage', async () => {
    vi.stubEnv('CONTEXT_LIMIT', '');
    vi.stubEnv('OPENAI_CONTEXT_LIMIT', '');
    const events: AgentEvent[] = [];
    const model = new MockLanguageModelV4({
      modelId: 'composer-2.5',
      doGenerate: {
        content: [{type: 'text', text: 'ok'}],
        finishReason: {unified: 'stop', raw: 'stop'},
        usage,
        warnings: []
      }
    });
    const provider = new OpenAiLlmProvider(model);
    const session = new AgentSession({
      cwd: '/project',
      plugins: [],
      onEvent: (event) => events.push(event)
    });

    await provider.plainChat([{role: 'user', content: 'hello'}], {session});

    const tokenEvent = events.find((event) => event.type === 'token_usage');
    expect(tokenEvent?.type === 'token_usage' && tokenEvent.usage.contextLimit).toBe(200_000);
  });

  it('uses AI SDK structured output validation', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{type: 'text', text: '{"mode":"react"}'}],
        finishReason: {unified: 'stop', raw: 'stop'},
        usage,
        warnings: []
      }
    });
    const provider = new OpenAiLlmProvider(model);

    await expect(
      provider.structuredChat(
        [{role: 'user', content: 'route'}],
        z.object({mode: z.enum(['react', 'dag'])})
      )
    ).resolves.toMatchObject({
      text: '{"mode":"react"}',
      value: {mode: 'react'}
    });
  });

  it('maps streamed reasoning, text, and tool calls', async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            {type: 'stream-start', warnings: []},
            {type: 'reasoning-start', id: 'reasoning-1'},
            {type: 'reasoning-delta', id: 'reasoning-1', delta: 'inspect'},
            {type: 'reasoning-end', id: 'reasoning-1'},
            {type: 'text-start', id: 'text-1'},
            {type: 'text-delta', id: 'text-1', delta: 'checking'},
            {type: 'text-end', id: 'text-1'},
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'read_file',
              input: '{"path":"package.json"}'
            },
            {
              type: 'finish',
              finishReason: {unified: 'tool-calls', raw: 'tool_calls'},
              usage
            }
          ]
        })
      }
    });
    const provider = new OpenAiLlmProvider(model);
    const onDelta = vi.fn();
    const onReasoningDelta = vi.fn();

    const message = await provider.streamWithTools([{role: 'user', content: 'check'}], {
      onDelta,
      onReasoningDelta
    });

    expect(onDelta).toHaveBeenCalledWith('checking');
    expect(onReasoningDelta).toHaveBeenCalledWith('inspect');
    expect(message).toEqual({
      role: 'assistant',
      content: [
        {type: 'text', text: 'checking'},
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'read_file',
          input: {path: 'package.json'}
        }
      ]
    });
  });
});
