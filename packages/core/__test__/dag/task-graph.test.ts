import {describe, expect, it} from 'vitest';
import {TaskGraph} from '../../src/dag/task-graph.js';

const task = (id: string, dependsOn: string[] = []) => ({
  id,
  kind: id === 'merge' ? ('merge' as const) : ('explore' as const),
  goal: id,
  dependsOn
});

describe('TaskGraph', () => {
  it('rejects duplicate node ids', () => {
    expect(() => TaskGraph.fromPlan([task('worker'), task('worker'), task('merge', ['worker'])]))
      .toThrow('DAG 规划包含重复节点 id');
  });

  it('collects failed descendants and external done inputs', () => {
    const graph = TaskGraph.fromPlan([
      task('root'),
      task('a', ['root']),
      task('b', ['a']),
      task('c', ['a']),
      task('merge', ['b', 'c'])
    ]);
    graph.nodes.get('root')!.status = 'done';
    graph.nodes.get('a')!.status = 'done';
    graph.nodes.get('b')!.status = 'done';
    graph.nodes.get('c')!.status = 'failed';

    const affected = graph.replanSet(['c']);

    expect([...affected]).toEqual(['c', 'merge']);
    expect(new Set(graph.externalDoneNodeIds(affected))).toEqual(new Set(['a', 'b']));
  });

  it('splices a same-id subgraph without resetting completed nodes', () => {
    const graph = TaskGraph.fromPlan([
      task('root'),
      task('failed', ['root']),
      task('merge', ['failed'])
    ]);
    graph.nodes.get('root')!.status = 'done';
    graph.nodes.get('failed')!.status = 'failed';

    graph.replaceSubgraph({
      tasks: [
        {...task('failed', ['root']), goal: 'repaired'},
        task('merge', ['failed'])
      ]
    });

    expect(graph.nodes.get('root')!.status).toBe('done');
    expect(graph.nodes.get('failed')).toMatchObject({status: 'pending', goal: 'repaired'});
    expect(graph.nodes.get('merge')!.status).toBe('pending');
    expect(graph.edges).toEqual([
      {from: 'root', to: 'failed'},
      {from: 'failed', to: 'merge'}
    ]);
  });

  it('rejects a cyclic replacement', () => {
    const graph = TaskGraph.fromPlan([task('a'), task('merge', ['a'])]);

    expect(() =>
      graph.replaceSubgraph({
        tasks: [task('a', ['merge']), task('merge', ['a'])]
      })
    ).toThrow('存在环');
  });
});
