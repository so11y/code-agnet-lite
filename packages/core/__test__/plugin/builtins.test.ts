import {beforeEach, describe, expect, it, vi} from 'vitest';

const {runPostTurnVerify} = vi.hoisted(() => ({runPostTurnVerify: vi.fn()}));

vi.mock('../../src/turn/post-turn.js', () => ({runPostTurnVerify}));

import {verifyPlugin} from '../../src/plugin/builtins.js';
import type {CodeAgent} from '../../src/code-agent.js';
import {AgentRunReason} from '../../src/react-agent.js';
import {AgentSession} from '../../src/session.js';
import type {PluginTurnContext} from '../../src/plugin/types.js';

const agent: CodeAgent = {
  run: async () => ({steps: 1, reason: AgentRunReason.FinalAnswer})
};

function context(succeeded: boolean): PluginTurnContext {
  const session = new AgentSession({cwd: '/project', onEvent() {}});
  return {
    session,
    targetCwd: session.cwd,
    input: 'work',
    route: {mode: 'dag', confidence: 1, reason: 'test'},
    agent,
    execution: {mode: 'dag', succeeded}
  };
}

describe('verifyPlugin DAG behavior', () => {
  beforeEach(() => {
    runPostTurnVerify.mockReset();
  });

  it('skips the outer gate after a successful internally verified DAG', async () => {
    await verifyPlugin().closeTurn?.(context(true));

    expect(runPostTurnVerify).not.toHaveBeenCalled();
  });

  it('keeps the outer gate after a failed DAG with possible side effects', async () => {
    const ctx = context(false);
    ctx.session.ledger.recordToolCall('write_file', {path: 'partial.ts'});

    await verifyPlugin().closeTurn?.(ctx);

    expect(runPostTurnVerify).toHaveBeenCalledWith(agent, ctx.session, 'dag');
  });

  it('preserves the DAG error without calling the gate when no side effects occurred', async () => {
    await verifyPlugin().closeTurn?.(context(false));

    expect(runPostTurnVerify).not.toHaveBeenCalled();
  });
});
