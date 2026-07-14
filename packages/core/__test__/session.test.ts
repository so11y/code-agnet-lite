import {describe, expect, it} from 'vitest';
import {AgentSession} from '../src/session.js';

describe('AgentSession cwd', () => {
  it('keeps runtime cwd separate from immutable session config', async () => {
    const session = new AgentSession({cwd: '/old', onEvent() {}});

    await session.setWorkspace('/new');

    expect(session.cwd).toBe('/new');
    const child = session.createChild({
      maxSteps: 5,
      onEvent() {},
      systemPrompt: 'child'
    });
    expect(child.cwd).toBe('/new');
    expect(child.config).toMatchObject({maxSteps: 5});
  });

  it('updates the workspace system message instead of leaving stale context', async () => {
    const session = new AgentSession({cwd: '/old', onEvent() {}});

    await session.setWorkspace('/new');

    const workspaceMessages = session.conversation.messages.filter(
      (message) => message.role === 'system' && String(message.content).startsWith('当前工作区：')
    );
    expect(workspaceMessages.map((message) => message.content)).toEqual(['当前工作区：/new']);
  });

  it('resets workspace-scoped conversation and memory before a new turn', async () => {
    const session = new AgentSession({cwd: '/old', plugins: [], onEvent() {}});
    session.conversation.appendUser('old task');
    session.ledger.state.facts.push('old fact');
    session.ledger.state.visitedFiles.push('src/old.ts');

    await session.ensureWorkspace('/new');

    expect(session.conversation.messages).toHaveLength(2);
    expect(session.conversation.messages[1].content).toBe('当前工作区：/new');
    expect(session.ledger.state.facts).toEqual([]);
    expect(session.ledger.state.visitedFiles).toEqual([]);
  });

  it('preserves the active turn when a tool changes workspace', async () => {
    const session = new AgentSession({cwd: '/old', plugins: [], onEvent() {}});
    session.conversation.appendUser('current task');
    session.ledger.state.facts.push('current fact');

    await session.setWorkspace('/new');

    expect(session.conversation.extractLastAssistantText()).toBe('');
    expect(session.conversation.messages.some((message) => message.content === 'current task')).toBe(true);
    expect(session.ledger.state.facts).toEqual(['current fact']);
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

  it('counts side effects as progress', () => {
    const session = new AgentSession({cwd: '/project', onEvent() {}});
    session.beginTurn('work');
    const before = session.ledger.snapshotProgress();
    session.ledger.recordToolCall('write_file', {path: 'changed.ts'});
    session.ledger.noteProgress(before);

    expect(session.ledger.state.noProgress).toBe(0);
  });
});
