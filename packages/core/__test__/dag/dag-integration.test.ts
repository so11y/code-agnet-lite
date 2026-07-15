import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  replan: vi.fn(),
  workerRun: vi.fn(),
  plainChat: vi.fn()
}));

vi.mock('../../src/dag/dag-planner.js', () => ({
  llmPlanDag: mocks.plan,
  llmReplanSubgraph: mocks.replan
}));

vi.mock('../../src/dag/worker.js', () => ({
  DagWorker: class {
    constructor(
      private readonly node: unknown,
      private readonly blackboard: unknown,
      private readonly session: unknown
    ) {}

    run() {
      return mocks.workerRun(this.node, this.blackboard, this.session);
    }
  }
}));

vi.mock('../../src/provider/openai-provider.js', () => ({
  openAiLlm: {
    plainChat: mocks.plainChat
  }
}));

import {runDagTurn} from '../../src/dag/orchestrator.js';
import {TaskGraph} from '../../src/dag/task-graph.js';
import {Blackboard, TaskOutput, type TaskNode} from '../../src/dag/dag-model.js';
import {AgentSession} from '../../src/session.js';

const tasks = [
  {id: 'worker', kind: 'explore' as const, goal: 'work', dependsOn: []},
  {id: 'merge', kind: 'merge' as const, goal: 'merge', dependsOn: ['worker']}
];

describe('DAG parent session integration', () => {
  beforeEach(() => {
    mocks.plan.mockReset();
    mocks.replan.mockReset();
    mocks.workerRun.mockReset();
    mocks.plainChat.mockReset();
    mocks.plan.mockImplementation(async () => TaskGraph.fromPlan(tasks));
    mocks.replan.mockResolvedValue({tasks});
    mocks.plainChat.mockResolvedValue('merged answer');
  });

  it('commits the final answer and all worker memory to the parent session', async () => {
    mocks.workerRun.mockResolvedValue(
      new TaskOutput({
        summary: 'worker done',
        facts: ['fact'],
        visitedFiles: ['a.ts'],
        searchedTerms: ['needle'],
        operations: {
          writtenFiles: ['a.ts'],
          deletedFiles: [],
          executedCommands: ['npm test']
        }
      })
    );
    const events: Array<{type: string; status?: string}> = [];
    const session = new AgentSession({cwd: '/project', onEvent: (event) => events.push(event)});
    session.beginTurn('do work');

    await expect(runDagTurn(session, 'do work')).resolves.toBe(true);

    expect(session.conversation.extractLastAssistantText()).toBe('merged answer');
    expect(session.ledger.state).toMatchObject({
      facts: ['fact'],
      visitedFiles: ['a.ts'],
      searchedTerms: ['needle'],
      operations: {
        writtenFiles: ['a.ts'],
        deletedFiles: [],
        executedCommands: ['npm test']
      }
    });
    expect(
      session.conversation.messages.some(
        (message) => message.role === 'assistant' && message.content === 'merged answer'
      )
    ).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({type: 'status', status: 'done'}));
  });

  it('keeps partial operations when the DAG exhausts recovery', async () => {
    mocks.workerRun.mockImplementation(
      async (node: TaskNode, blackboard: Blackboard) => {
        blackboard.mergeNodeOutput(
          node.id,
          new TaskOutput({
            summary: '',
            operations: {
              writtenFiles: ['partial.ts'],
              deletedFiles: [],
              executedCommands: []
            }
          })
        );
        throw new Error('worker failed');
      }
    );
    const assistantMessages: string[] = [];
    const session = new AgentSession({
      cwd: '/project',
      onEvent(event) {
        if (event.type === 'message' && event.role === 'assistant') {
          assistantMessages.push(event.content);
        }
      }
    });
    session.beginTurn('do work');

    await expect(runDagTurn(session, 'do work')).resolves.toBe(false);

    expect(session.ledger.snapshotOperations().writtenFiles).toEqual(['partial.ts']);
    expect(assistantMessages).toEqual([]);
  });
});
