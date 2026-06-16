import type {ChatCompletion} from 'openai/resources/chat/completions';
import {toolsByName} from '../tools/index.js';
import {callLlm} from './llm.js';
import {ReActAgent} from './react-agent.js';
import {routeReasoningMode} from './router.js';
import {AgentSession} from './session.js';
import {createTotPlannerContext, registerTotPlanner} from './tot-planner.js';
import type {AgentMessage, AgentOptions} from './types.js';

class CodeAgent extends ReActAgent {
  protected callLlm(messages: AgentMessage[]): Promise<ChatCompletion> {
    return callLlm(messages);
  }

  protected findTool(name: string) {
    return toolsByName.get(name);
  }
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const session = new AgentSession(options);

  session.announceUser();
  session.status('thinking', '路由判断');
  const route = await routeReasoningMode(options.input, session.cwd);

  switch (route.mode) {
    case 'tot':
      await runTotAgent(options, session);
      return;
    case 'react':
      await new CodeAgent(options, session).run();
      break;
  }
}

async function runTotAgent(options: AgentOptions, session: AgentSession) {
  const context = createTotPlannerContext(options.maxTotRounds ?? 3);
  let lastError: unknown;

  while (context.round < context.maxRounds) {
    context.round += 1;
    context.shouldRetry = false;
    context.exhausted = false;
    lastError = undefined;

    const agent = new CodeAgent(options, session);
    registerTotPlanner(agent, session, context);

    try {
      await agent.run();
    } catch (error) {
      lastError = error;
    }

    if (!context.shouldRetry) {
      if (lastError) {
        throw lastError;
      }

      if (context.exhausted) {
        session.status('error', `ToT 已达到 ${context.maxRounds} 轮修正上限`);
        return;
      }

      session.status('done', '完成');
      return;
    }

    session.status(
      'thinking',
      `ToT 修正后继续执行 ${context.round + 1}/${context.maxRounds}`
    );
  }

  if (lastError) {
    throw lastError;
  }

  session.status('error', `ToT 已达到 ${context.maxRounds} 轮修正上限`);
}
