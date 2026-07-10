import {describe, expect, it, vi} from 'vitest';
import type {AgentMessage, LlmStreamOptions} from '../../src/session-types.js';

vi.mock('../../src/router.js', () => ({
  routeReasoningMode: vi.fn(async () => ({
    mode: 'react' as const,
    confidence: 1,
    reason: 'debug 固定走 react'
  }))
}));

vi.mock('../../src/provider/openai-provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/provider/openai-provider.js')>();
  return {
    ...actual,
    openAiLlm: {
      kind: 'openai' as const,
      streamWithTools: vi.fn(async (_messages: AgentMessage[], options: LlmStreamOptions) => {
        options?.onDelta?.('debug: defaultPlugins agent 回复');
        return {
          role: 'assistant' as const,
          content: 'debug: defaultPlugins agent 回复'
        };
      }),
      chatWithTools: vi.fn(),
      plainChat: vi.fn()
    }
  };
});

vi.mock('../../src/verify/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/verify/index.js')>();
  return {
    ...actual,
    judgeShouldVerify: vi.fn(async (session: AgentSession) => ({
      ...session.ledger.collectTurnSummary(session.conversation.extractLastAssistantText()),
      gate: {shouldVerify: false, reason: 'debug 跳过 verify'}
    }))
  };
});

import type {AgentEvent} from '../../src/types/events.js';
import {defaultPlugins, PluginDriver} from '../../src/plugin/index.js';
import {runAgentTurn} from '../../src/loop.js';
import {AgentSession} from '../../src/session.js';

/** 不传 plugins，runAgentTurn 内部会走 defaultPlugins(provider)。 */
async function createDebugSession() {
  const events: AgentEvent[] = [];

  const session = await AgentSession.open({
    cwd: process.cwd(),
    plugins: defaultPlugins(),
    provider: 'openai',
    onEvent: (event) => events.push(event)
  });

  return {session, events};
}

describe('debug: core turn flow (defaultPlugins)', {timeout: 0}, () => {
  it('PluginDriver — 调试 defaultPlugins 流水线', async () => {
    const {session, events} = await createDebugSession();

    await new PluginDriver(defaultPlugins()).run(
      '帮我看看这个项目结构',
      process.cwd(),
      session
    );

    expect(session.reasoningMode).toBe('react');
    expect(session.conversation.extractLastAssistantText()).toContain('debug: defaultPlugins agent 回复');
    expect(events.some((e) => e.type === 'status' && e.status === 'done')).toBe(true);
  });

  it('runAgentTurn — 调试 loop 入口（等同 CLI 调 core，无 Ink）', async () => {
    const {session, events} = await createDebugSession();

    await runAgentTurn(
      session,
      '并行探索 packages/core/src/turn 和 packages/core/src/dag，各自理清入口和调用链，最后汇总它们怎么串起来。'
    );

    expect(events.some((e) => e.type === 'status' && e.status === 'done')).toBe(true);
  });
});
