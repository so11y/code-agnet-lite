import {describe, expect, it, vi} from 'vitest';

const planner = vi.hoisted(() => ({
  reviewCalls: 0,
  llmPlan: vi.fn(async (session) => session.ledger.applyHypotheses(['候选方向'])),
  llmReplan: vi.fn(),
  updateStateFromRun: vi.fn(async (session) => {
    planner.reviewCalls += 1;
    const accepted = planner.reviewCalls === 2;
    const confidence = accepted ? 0.95 : 0.2;
    session.ledger.applyReview(
      {
        directionCorrect: accepted,
        summary: '',
        confidence,
        facts: [],
        rejected: [],
        hypotheses: [],
        verification: []
      },
      false
    );
    return {
      directionCorrect: accepted,
      summary: accepted ? '接受' : '拒绝',
      confidence,
      facts: [],
      rejected: accepted ? [] : ['候选方向'],
      hypotheses: accepted ? [] : ['修正方向'],
      verification: []
    };
  })
}));

vi.mock('../../src/planner.js', () => planner);

import {AgentSession} from '../../src/session.js';
import {AgentRunReason} from '../../src/react-agent.js';
import {runTotTurnWithRetries} from '../../src/turn/tot-turn.js';

describe('runTotTurnWithRetries', () => {
  it('publishes only the accepted assistant answer', async () => {
    planner.reviewCalls = 0;
    const visible: string[] = [];
    const session = new AgentSession({
      cwd: '/project',
      onEvent(event) {
        if (event.type === 'message' && event.role === 'assistant') {
          visible.push(event.content);
        }
      }
    });
    session.beginTurn('设计方案');
    let run = 0;
    const agent = {
      async run() {
        run += 1;
        session.conversation.addAssistant({role: 'assistant', content: `候选 ${run}`});
        return {steps: 1, reason: AgentRunReason.FinalAnswer};
      }
    };

    const result = await runTotTurnWithRetries(session, agent, 2);

    expect(result.directionCorrect).toBe(true);
    expect(visible).toEqual(['候选 2']);
  });
});
