import {beforeEach, describe, expect, it, vi} from 'vitest';

const {callStructuredLlm} = vi.hoisted(() => ({callStructuredLlm: vi.fn()}));

vi.mock('../src/structured-llm-caller.js', () => ({callStructuredLlm}));

import {routeReasoningMode} from '../src/router.js';
import {AgentSession} from '../src/session.js';

describe('routeReasoningMode', () => {
  beforeEach(() => {
    callStructuredLlm.mockReset();
  });

  it('does not downgrade a valid DAG route because of low confidence', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    callStructuredLlm.mockResolvedValue({
      mode: 'dag',
      confidence: 0.2,
      reason: '用户指定 DAG'
    });

    await expect(routeReasoningMode('请使用 DAG 流程执行', session)).resolves.toEqual({
      mode: 'dag',
      confidence: 0.2,
      reason: '用户指定 DAG'
    });
    expect(callStructuredLlm).toHaveBeenCalledOnce();
  });
});
