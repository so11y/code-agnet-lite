import {beforeEach, describe, expect, it, vi} from 'vitest';

const {callStructuredLlm} = vi.hoisted(() => ({callStructuredLlm: vi.fn()}));

vi.mock('../src/structured-llm-caller.js', () => ({callStructuredLlm}));

import {routeReasoningMode} from '../src/router.js';
import {AgentSession} from '../src/session.js';

describe('routeReasoningMode', () => {
  beforeEach(() => {
    callStructuredLlm.mockReset();
  });

  it('honors an explicit DAG request without calling the model', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    callStructuredLlm.mockResolvedValue({
      mode: 'dag',
      confidence: 0.2,
      reason: '用户指定 DAG'
    });

    await expect(routeReasoningMode('请使用 DAG 流程执行', session)).resolves.toEqual({
      mode: 'dag',
      confidence: 1,
      reason: '用户明确指定 dag 模式。'
    });
    expect(callStructuredLlm).not.toHaveBeenCalled();
  });

  it('passes conversation context to the model for implicit routing', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    session.conversation.appendUser('前一轮选择了方案二', {emit: false});
    session.conversation.addAssistant({role: 'assistant', content: '方案二是事件驱动实现'});
    session.beginTurn('继续实现');
    session.conversation.appendUser('继续实现', {emit: false});
    callStructuredLlm.mockResolvedValue({mode: 'react', confidence: 0.9, reason: '继续执行'});

    await routeReasoningMode('继续实现', session);

    expect(callStructuredLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('方案二是事件驱动实现')
          })
        ])
      })
    );
  });

  it('does not treat a question about DAG as a request to execute in DAG mode', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    callStructuredLlm.mockResolvedValue({mode: 'react', confidence: 0.9, reason: '解释概念'});

    await expect(routeReasoningMode('DAG 模式为什么这样并发？', session)).resolves.toMatchObject({
      mode: 'react'
    });
    expect(callStructuredLlm).toHaveBeenCalledOnce();
  });
});
