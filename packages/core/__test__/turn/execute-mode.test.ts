import {describe, expect, it, vi} from 'vitest';

const {runTotTurnWithRetries} = vi.hoisted(() => ({runTotTurnWithRetries: vi.fn()}));

vi.mock('../../src/turn/tot-turn.js', () => ({
  runTotTurnWithRetries,
  shouldContinueTot: () => true
}));

import {DefaultCodeAgent, type CodeAgent} from '../../src/code-agent.js';
import {AgentRunReason} from '../../src/react-agent.js';
import {AgentSession} from '../../src/session.js';
import {executeReasoningMode} from '../../src/turn/execute-mode.js';

describe('executeReasoningMode', () => {
  it('returns an incomplete execution so closeTurn can still verify side effects', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    const agent: CodeAgent = {
      run: async () => ({steps: 20, reason: AgentRunReason.MaxSteps})
    };

    await expect(executeReasoningMode(session, 'react', {agent})).resolves.toEqual({
      mode: 'react',
      succeeded: false,
      reason: AgentRunReason.MaxSteps
    });
  });

  it('treats a final best-effort ToT answer as completed', async () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    runTotTurnWithRetries.mockResolvedValue({
      run: {steps: 2, reason: AgentRunReason.FinalAnswer},
      directionCorrect: false,
      confidence: 0.6
    });

    await expect(
      executeReasoningMode(session, 'tot', {
        agent: new DefaultCodeAgent(session.config, session)
      })
    ).resolves.toEqual({mode: 'tot', succeeded: true, reason: 'best_effort'});
  });
});
