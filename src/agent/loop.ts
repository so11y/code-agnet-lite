import type {ChatCompletionAssistantMessageParam} from 'openai/resources/chat/completions';
import {isEmpty} from 'lodash-es';
import {toolsByName} from '../tools/index.js';
import {callLlmStream} from './llm.js';
import {llmPlan, llmReplan, updateStateFromRun} from './planner.js';
import {ReActAgent} from './react-agent.js';
import {routeReasoningMode} from './router.js';
import {AgentSession} from './session.js';
import type {AgentMessage, AgentOptions} from './types.js';

class CodeAgent extends ReActAgent {
  protected streamLlm(
    messages: AgentMessage[],
    onDelta: (delta: string) => void
  ): Promise<ChatCompletionAssistantMessageParam> {
    return callLlmStream(messages, onDelta);
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
      session.status('done', '完成');
      return;
    }
  }
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const session = new AgentSession(options);
  const agent = new CodeAgent(options, session);

  session.announceUser();
  session.status('thinking', '路由判断');
  const route = await routeReasoningMode(options.input, session.cwd);

  switch (route.mode) {
    case 'react':
      await agent.run();
      return;
    case 'tot':
      await runTotLoop(agent, session);
      return;
  }
}
