import {describe, expect, it} from 'vitest';
import {BaseMemory} from '../../src/agent-memory.js';
import {TaskOutput} from '../../src/dag/dag-model.js';

describe('TaskOutput', () => {
  it('owns retry output aggregation and keeps the public shape stable', () => {
    const first = new BaseMemory();
    first.facts = ['fact'];
    first.visitedFiles = ['a.ts'];

    const output = new TaskOutput();
    const attempt = {
      ...first,
      operations: {writtenFiles: ['a.ts'], deletedFiles: [], executedCommands: ['test']}
    };
    output.mergeFrom(attempt);
    output.mergeFrom(attempt);
    output.summary = 'done';

    expect(output.operations).toEqual({
      writtenFiles: ['a.ts'],
      deletedFiles: [],
      executedCommands: ['test']
    });
    expect(JSON.parse(JSON.stringify(output))).toEqual({
      summary: 'done',
      operations: output.operations,
      facts: ['fact'],
      visitedFiles: ['a.ts'],
      searchedTerms: []
    });
  });
});
