import {isEmpty} from 'lodash-es';
import type {ReActAgent} from '../react-agent.js';
import {llmPlan, llmReplan, updateStateFromRun} from '../planner.js';
import type {AgentSession} from '../session.js';

export async function runTotTurn(session: AgentSession, agent: ReActAgent): Promise<void> {  while (true) {
    session.throwIfAborted();

    if (session.state.noProgress >= 2) {
      await llmReplan(session);
      session.state.noProgress = 0;
    } else if (isEmpty(session.state.hypotheses)) {
      await llmPlan(session);
    }

    const progressBefore = session.snapshotProgress();

    let result;
    try {
      result = await agent.run();
    } catch (error) {
      await updateStateFromRun(
        session,
        {completed: false, steps: 0, reason: 'max_steps'},
        error,
        progressBefore
      );
      throw error;
    }

    await updateStateFromRun(session, result, undefined, progressBefore);

    if (result.completed || session.state.confidence >= 0.9) {
      return;
    }
  }
}
