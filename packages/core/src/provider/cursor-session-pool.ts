import {Agent, type Run, type SDKAgent} from '@cursor/sdk';
import {getCursorApiKey, getCursorModelSelection} from '@code-agent-lite/platform';
import type {AgentSession} from '../session.js';
import type {CursorAgentHandle, CursorRunHandle} from './types.js';

type CursorSessionState = {
  agent: CursorAgentHandle;
  cwd: string;
};

function wrapSdkAgent(agent: SDKAgent): CursorAgentHandle {
  return {
    async send(prompt: string): Promise<CursorRunHandle> {
      const run: Run = await agent.send(prompt);
      return {
        stream: () => run.stream(),
        wait: () => run.wait()
      };
    },
    async dispose() {
      await agent[Symbol.asyncDispose]();
    }
  };
}

async function createCursorAgent(cwd: string): Promise<CursorAgentHandle> {
  const agent = await Agent.create({
    apiKey: getCursorApiKey(),
    model: getCursorModelSelection(),
    local: {cwd}
  });

  return wrapSdkAgent(agent);
}

export class CursorSessionPool {
  private readonly sessions = new WeakMap<AgentSession, CursorSessionState>();

  async ensure(session: AgentSession, cwd: string): Promise<CursorAgentHandle> {
    const existing = this.sessions.get(session);

    if (existing && existing.cwd === cwd) {
      return existing.agent;
    }

    if (existing) {
      await existing.agent.dispose();
    }

    const agent = await createCursorAgent(cwd);
    this.sessions.set(session, {agent, cwd});
    return agent;
  }

  async dispose(session: AgentSession): Promise<void> {
    const existing = this.sessions.get(session);
    this.sessions.delete(session);

    if (existing) {
      await existing.agent.dispose();
    }
  }
}

export const cursorSessionPool = new CursorSessionPool();
