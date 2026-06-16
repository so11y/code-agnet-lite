import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {isEmpty} from 'lodash-es';
import {toolsByName} from '../tools/index.js';
import {callLlmStream} from './llm.js';
import {llmPlan, llmReplan, updateStateFromRun} from './planner.js';
import {ReActAgent} from './react-agent.js';
import {routeReasoningMode} from './router.js';
import {AgentSession} from './session.js';
import type {AgentMessage} from './session-types.js';
import {judgeShouldVerify, runVerifyAndFixLoop} from './verify.js';

class CodeAgent extends ReActAgent {
  protected async streamLlm(
    messages: AgentMessage[],
    onDelta: (delta: string) => void
  ): Promise<ChatCompletionAssistantMessageParam> {
    return callLlmStream(messages, this.session.streamOptions(onDelta));
  }

  protected findTool(name: string) {
    return toolsByName.get(name);
  }
}

async function runTotLoop(agent: CodeAgent, session: AgentSession): Promise<void> {
  while (true) {
    if (session.state.noProgress >= 2) {
      await llmReplan(session);
      session.state.noProgress = 0;
    } else if (isEmpty(session.state.hypotheses)) {
      await llmPlan(session);
    }

    const progressBefore = session.snapshotProgress();

    let result;
    try {
      result = await agent.run({suppressTerminalStatus: true});
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


export async function runAgentTurn(
  session: AgentSession,
  input: string,
  cwd?: string
): Promise<void> {
  const targetCwd = cwd ?? session.cwd;
  if (targetCwd !== session.cwd) {
    session.setWorkspace(targetCwd);
  }

  session.beginTurn(input);
  session.appendUser(input);

  const agent = new CodeAgent(session.options, session);

  session.status('thinking', '路由判断');
  const route = await routeReasoningMode(input, session);
  session.reasoningMode = route.mode;

  switch (route.mode) {
    case 'react':
      await agent.run({suppressTerminalStatus: true});
      break;
    case 'tot':
      await runTotLoop(agent, session);
      break;
  }

  const review = await judgeShouldVerify(session);

  if (review.gate.shouldVerify) {
    await runVerifyAndFixLoop(agent, session, review);
    return;
  }

  session.status('done', '完成');
}
