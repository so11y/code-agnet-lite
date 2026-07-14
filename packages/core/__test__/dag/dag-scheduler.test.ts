import {describe, expect, it} from 'vitest';
import type {AgentSession} from '../../src/session.js';
import {DagScheduler} from '../../src/dag/dag-scheduler.js';
import {TaskGraph} from '../../src/dag/task-graph.js';
import {Blackboard, TaskOutput, type TaskNode} from '../../src/dag/dag-model.js';

const task = (id: string, dependsOn: string[] = []) => ({
  id,
  kind: id === 'merge' ? ('merge' as const) : ('explore' as const),
  goal: id,
  dependsOn
});

const session = {
  cwd: '',
  events: {status() {}, emit() {}},
  throwIfAborted() {}
} as unknown as AgentSession;

const output = () =>
  new TaskOutput({
    summary: 'done',
    operations: {writtenFiles: [], deletedFiles: [], executedCommands: []}
  });

describe('DagScheduler', () => {
  it('runs dependencies correctly even when nodes are not stored in topological order', async () => {
    const graph = TaskGraph.fromPlan([task('merge', ['worker']), task('worker')]);
    const executed: string[] = [];
    const scheduler = new DagScheduler(graph, {session, blackboard: new Blackboard(), userInput: ''});
    Reflect.set(scheduler, 'executeNode', async (node: TaskNode) => {
      executed.push(node.id);
      return output();
    });

    await scheduler.run();

    expect(executed).toEqual(['worker', 'merge']);
    expect(graph.nodes.get('merge')!.status).toBe('done');
  });

  it('leaves blocked descendants pending so recovery can resume them later', async () => {
    const graph = TaskGraph.fromPlan([
      task('failed'),
      task('blocked', ['failed']),
      task('independent'),
      task('merge', ['blocked', 'independent'])
    ]);
    const scheduler = new DagScheduler(graph, {session, blackboard: new Blackboard(), userInput: ''});
    Reflect.set(scheduler, 'executeNode', async (node: TaskNode) => {
      if (node.id === 'failed') {
        throw new Error('boom');
      }
      return output();
    });

    await scheduler.run();

    expect(graph.nodes.get('failed')!.status).toBe('failed');
    expect(graph.nodes.get('independent')!.status).toBe('done');
    expect(graph.nodes.get('blocked')!.status).toBe('pending');
    expect(graph.nodes.get('merge')!.status).toBe('pending');
  });

  it('continues the same scheduling loop after recovery updates the graph', async () => {
    const graph = TaskGraph.fromPlan([
      task('worker'),
      task('downstream', ['worker']),
      task('merge', ['downstream'])
    ]);
    let workerRuns = 0;
    let recoveries = 0;
    const scheduler = new DagScheduler(graph, {
      session,
      blackboard: new Blackboard(),
      userInput: '',
      tryRecoverFailures: async () => {
        recoveries += 1;
        graph.replaceSubgraph({
          tasks: [
            {...task('worker'), goal: 'repaired'},
            task('downstream', ['worker']),
            task('merge', ['downstream'])
          ]
        });
        return true;
      }
    });
    Reflect.set(scheduler, 'executeNode', async (node: TaskNode) => {
      if (node.id === 'worker' && workerRuns++ === 0) {
        throw new Error('boom');
      }
      return output();
    });

    await scheduler.run();

    expect(recoveries).toBe(1);
    expect(workerRuns).toBe(2);
    expect(graph.nodes.get('downstream')!.status).toBe('done');
    expect(graph.nodes.get('merge')!.status).toBe('done');
  });
});
