import {beforeEach, describe, expect, it, vi} from 'vitest';

const {ensure, sendModes} = vi.hoisted(() => ({
  ensure: vi.fn(),
  sendModes: [] as Array<string | undefined>
}));

vi.mock('../../src/provider/cursor-session-pool.js', () => ({
  cursorSessionPool: {ensure, dispose: vi.fn()}
}));

import {CursorCodeAgent} from '../../src/provider/cursor-code-agent.js';
import {AgentSession} from '../../src/session.js';

describe('CursorCodeAgent transcript', () => {
  beforeEach(() => {
    ensure.mockReset();
    sendModes.length = 0;
  });

  it('records assistant tool calls before their tool results', async () => {
    ensure.mockResolvedValue({
      async send(_prompt: string, options?: {mode?: string}) {
        sendModes.push(options?.mode);
        return {
          async *stream() {
            yield {
              type: 'tool_call',
              call_id: 'call-1',
              name: 'write_file',
              status: 'completed',
              args: {path: 'a.ts'},
              result: 'ok'
            };
            yield {type: 'assistant', delta: '完成'};
          },
          async wait() {
            return {status: 'completed'};
          }
        };
      }
    });
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    session.beginTurn('修改文件');
    session.conversation.appendUser('修改文件', {emit: false});

    await new CursorCodeAgent(session).run();

    expect(session.conversation.messages.slice(3).map((message) => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant'
    ]);
    expect(session.ledger.snapshotOperations().writtenFiles).toEqual(['a.ts']);
    expect(session.conversation.extractLastAssistantText()).toBe('完成');
    expect(sendModes).toEqual(['agent']);
  });

  it('uses Cursor plan mode when the session has no mutating tools', async () => {
    ensure.mockResolvedValue({
      async send(_prompt: string, options?: {mode?: string}) {
        sendModes.push(options?.mode);
        return {
          async *stream() {},
          async wait() {
            return {status: 'completed', result: 'summary'};
          }
        };
      }
    });
    const session = new AgentSession({
      cwd: '/project',
      tools: {tools: [], find: () => undefined},
      onEvent() {}
    });
    session.beginTurn('summarize');

    await new CursorCodeAgent(session).run();

    expect(sendModes).toEqual(['plan']);
  });
});
