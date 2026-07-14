import {describe, expect, it} from 'vitest';
import type {CodeAgent} from '../../src/code-agent.js';
import {AgentSession} from '../../src/session.js';
import {executeReasoningMode} from '../../src/turn/execute-mode.js';

describe('executeReasoningMode', () => {
  it('rejects an incomplete ReAct run instead of continuing to verification', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    const agent: CodeAgent = {
      run: async () => ({completed: false, steps: 20, reason: 'max_steps'})
    };

    await expect(executeReasoningMode(session, 'react', {agent})).rejects.toThrow(
      'Agent 未在 20 步内完成任务'
    );
  });
});
