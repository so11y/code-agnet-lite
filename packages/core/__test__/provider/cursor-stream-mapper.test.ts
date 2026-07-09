import {describe, expect, it} from 'vitest';
import {
  extractCursorText,
  formatCursorToolOutput,
  mapCursorStreamEvent,
  shouldStartAssistantStream,
  type CursorStreamMapperSink,
  type CursorSdkMessage
} from '../../src/provider/cursor-stream-mapper.js';
import type {FinishToolOptions} from '../../src/session/finish-tool-options.js';
import type {TokenUsage, ToolCallItem} from '../../src/session-types.js';

function createSink() {
  const toolStarts: ToolCallItem[] = [];
  const toolEnds: Array<{id: string; output: string; options?: FinishToolOptions}> = [];
  const texts: string[] = [];
  const usages: TokenUsage[] = [];

  const sink: CursorStreamMapperSink = {
    startTool(call) {
      toolStarts.push(call);
    },
    finishTool(id, output, options) {
      toolEnds.push({id, output, options});
    },
    appendAssistantDelta(text) {
      texts.push(text);
    },
    recordTokenUsage(usage) {
      usages.push(usage);
    }
  };

  return {sink, toolStarts, toolEnds, texts, usages};
}

describe('extractCursorText', () => {
  it('reads delta text', () => {
    expect(extractCursorText({type: 'assistant', delta: 'hello'})).toBe('hello');
  });

  it('reads assistant content blocks', () => {
    expect(
      extractCursorText({
        type: 'assistant',
        message: {content: [{type: 'text', text: 'world'}]}
      })
    ).toBe('world');
  });
});

describe('formatCursorToolOutput', () => {
  it('stringifies object results', () => {
    expect(formatCursorToolOutput({ok: true})).toContain('"ok": true');
  });
});

describe('mapCursorStreamEvent', () => {
  it('maps running tool_call to startTool', () => {
    const {sink, toolStarts, toolEnds} = createSink();
    const openTools = new Map<string, ToolCallItem>();

    const result = mapCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'call-1',
        name: 'read_file',
        status: 'running',
        args: {path: 'a.ts'}
      },
      sink,
      openTools
    );

    expect(result).toBe('tool');
    expect(toolStarts).toEqual([{id: 'call-1', name: 'read_file', input: {path: 'a.ts'}}]);
    expect(toolEnds).toEqual([]);
    expect(openTools.has('call-1')).toBe(true);
  });

  it('maps completed tool_call to finishTool', () => {
    const {sink, toolStarts, toolEnds} = createSink();
    const openTools = new Map<string, ToolCallItem>([
      ['call-1', {id: 'call-1', name: 'read_file', input: {path: 'a.ts'}}]
    ]);

    mapCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'call-1',
        name: 'read_file',
        status: 'completed',
        result: 'file content'
      },
      sink,
      openTools
    );

    expect(toolStarts).toEqual([]);
    expect(toolEnds).toEqual([{id: 'call-1', output: 'file content', options: {toolName: 'read_file', toolInput: {path: 'a.ts'}}}]);
    expect(openTools.has('call-1')).toBe(false);
  });

  it('records usage events', () => {
    const {sink, usages} = createSink();

    const result = mapCursorStreamEvent(
      {
        type: 'usage',
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 120
        }
      },
      sink,
      new Map<string, ToolCallItem>()
    );

    expect(result).toBe('usage');
    expect(usages).toEqual([
      {
        prompt: 100,
        completion: 20,
        total: 120,
        contextUsed: 100
      }
    ]);
  });

  it('appends assistant text', () => {
    const {sink, texts} = createSink();

    const result = mapCursorStreamEvent(
      {type: 'assistant', delta: 'hi'},
      sink,
      new Map<string, ToolCallItem>()
    );

    expect(result).toBe('text');
    expect(texts).toEqual(['hi']);
  });
});

describe('shouldStartAssistantStream', () => {
  it('returns false for tool and usage events', () => {
    expect(shouldStartAssistantStream({type: 'tool_call'})).toBe(false);
    expect(shouldStartAssistantStream({type: 'usage'})).toBe(false);
  });

  it('returns true when assistant text exists', () => {
    expect(shouldStartAssistantStream({type: 'assistant', delta: 'hello'})).toBe(true);
  });
});
