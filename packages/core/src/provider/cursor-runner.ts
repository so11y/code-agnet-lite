/// <reference path="./cursor-sdk.d.ts" />

import {getCursorApiKey, getCursorModel} from '@code-agent-lite/platform';
import type {AgentSession} from '../session.js';
import type {CursorAgentHandle} from './types.js';

type CursorSdkAgent = {
  send(prompt: string): Promise<CursorSdkRun>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CursorSdkRun = {
  stream(): AsyncIterable<CursorSdkMessage>;
  wait(): Promise<{status: string; result?: string; id?: string}>;
};

type CursorSdkMessage = {
  type?: string;
  message?: {
    content?: Array<{type?: string; text?: string}>;
  };
  delta?: string;
  text?: string;
};

async function loadCursorSdk() {
  try {
    return await import('@cursor/sdk');
  } catch {
    throw new Error(
      'Cursor provider 需要安装 @cursor/sdk。运行：npm install @cursor/sdk -w @code-agent-lite/core'
    );
  }
}

function extractTextFromMessage(message: CursorSdkMessage): string {
  if (typeof message.delta === 'string') {
    return message.delta;
  }

  if (typeof message.text === 'string') {
    return message.text;
  }

  const blocks = message.message?.content;
  if (!blocks?.length) {
    return '';
  }

  return blocks
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('');
}

function mapStreamEvent(session: AgentSession, event: CursorSdkMessage) {
  const text = extractTextFromMessage(event);

  if (!text) {
    return;
  }

  if (event.type === 'assistant' || event.type === 'message' || event.delta || event.text) {
    session.appendAssistantDelta(text);
  }
}

export async function createCursorAgent(cwd: string): Promise<CursorAgentHandle> {
  const {Agent} = await loadCursorSdk();
  const agent = (await Agent.create({
    apiKey: getCursorApiKey(),
    model: {id: getCursorModel()},
    local: {cwd}
  })) as CursorSdkAgent;

  return {
    async send(prompt: string) {
      const run = await agent.send(prompt);
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

export async function runCursorAgentTurn(
  session: AgentSession,
  input: string,
  cwd: string
): Promise<void> {
  const targetCwd = cwd || session.cwd;
  if (targetCwd !== session.cwd) {
    session.setWorkspace(targetCwd);
  }

  session.beginTurn(input);
  session.appendUser(input, {emit: false});
  session.status('thinking', 'Cursor Agent');

  let agent = session.cursorAgent;

  if (!agent || session.cursorAgentCwd !== targetCwd) {
    await disposeCursorAgent(session);
    agent = await createCursorAgent(targetCwd);
    session.setCursorAgent(agent);
    session.setCursorAgentCwd(targetCwd);
  }

  session.startAssistantStream();

  try {
    const run = await agent.send(input);

    for await (const event of run.stream()) {
      mapStreamEvent(session, event as CursorSdkMessage);
    }

    const result = await run.wait();

    if (result.status === 'error') {
      throw new Error(`Cursor Agent 运行失败（run ${result.id ?? 'unknown'}）`);
    }

    const text = result.result?.trim();
    session.commitAssistant({role: 'assistant', content: text || null}, true);

    if (result.status !== 'error' && !text) {
      session.say('assistant', '（Cursor Agent 未返回文本）');
    }

    session.status('done', '完成');
  } catch (error) {
    session.status('error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function disposeCursorAgent(session: AgentSession): Promise<void> {
  const agent = session.cursorAgent;
  session.setCursorAgent(undefined);
  session.setCursorAgentCwd(undefined);

  if (agent) {
    await agent.dispose();
  }
}
