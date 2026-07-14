import {describe, expect, it} from 'vitest';
import {AgentSession} from '../src/session.js';

describe('AgentSession cwd', () => {
  it('keeps cwd and options.cwd as one source of truth', async () => {
    const session = new AgentSession({cwd: '/old', onEvent() {}});

    await session.setWorkspace('/new');

    expect(session.cwd).toBe('/new');
    expect(session.options.cwd).toBe('/new');
    expect(session.createChildOptions({maxSteps: 5})).toMatchObject({cwd: '/new', maxSteps: 5});
  });

  it('updates the workspace system message instead of leaving stale context', async () => {
    const session = new AgentSession({cwd: '/old', onEvent() {}});

    await session.setWorkspace('/new');

    const workspaceMessages = session.conversation.messages.filter(
      (message) => message.role === 'system' && String(message.content).startsWith('当前工作区：')
    );
    expect(workspaceMessages.map((message) => message.content)).toEqual(['当前工作区：/new']);
  });
});

describe('AgentSession turn state', () => {
  it('resets task hypotheses and re-emits repeated operations in a new turn', () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});

    session.beginTurn('first');
    session.ledger.state.hypotheses = ['old hypothesis'];
    session.ledger.state.confidence = 0.8;
    session.ledger.state.noProgress = 2;
    session.ledger.recordToolCall('write_file', {path: 'same.ts'});
    session.flushStateDelta();

    session.beginTurn('second');
    session.ledger.recordToolCall('write_file', {path: 'same.ts'});
    session.flushStateDelta();

    expect(session.ledger.state.hypotheses).toEqual([]);
    expect(session.ledger.state.confidence).toBe(0);
    expect(session.ledger.state.noProgress).toBe(0);
    const deltas = session.conversation.messages.filter(
      (message) => message.role === 'system' && String(message.content).startsWith('[stateΔ')
    );
    expect(deltas).toHaveLength(2);
    expect(String(deltas[1].content)).toContain('+ written this turn: same.ts');
  });
});
