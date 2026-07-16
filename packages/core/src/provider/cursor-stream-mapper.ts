import {truncate} from '@code-agent-lite/shared';
import type {TokenUsage, ToolCallItem} from '../session-types.js';
import type {FinishToolOptions} from '../session/finish-tool-options.js';
import {normalizeCursorUsage} from './token-usage.js';
import type {CursorSdkTokenUsage} from './types.js';

export type CursorSdkMessage = {
  type?: string;
  call_id?: string;
  name?: string;
  status?: 'running' | 'completed' | 'error';
  args?: unknown;
  result?: unknown;
  text?: string;
  message?: {
    content?: Array<{type?: string; text?: string}>;
  };
  delta?: string;
  usage?: CursorSdkTokenUsage;
};

export type CursorStreamMapperSink = {
  startTool(call: ToolCallItem): void;
  finishTool(id: string, output: string, options?: FinishToolOptions): void;
  appendAssistantDelta(text: string): void;
  showThinking(text: string): void;
  recordTokenUsage(usage: TokenUsage): void;
};

export enum CursorStreamEventResult {
  Usage = 'usage',
  Tool = 'tool',
  Thinking = 'thinking',
  Text = 'text',
  Skip = 'skip'
}

export function formatCursorToolOutput(result: unknown): string {
  if (typeof result === 'string') {
    return truncate(result);
  }

  if (result === undefined || result === null) {
    return '';
  }

  try {
    return truncate(JSON.stringify(result, null, 2));
  } catch {
    return truncate(String(result));
  }
}

export function extractCursorText(message: CursorSdkMessage): string {
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

function mapToolCallEvent(
  sink: CursorStreamMapperSink,
  event: CursorSdkMessage,
  openTools: Map<string, ToolCallItem>
) {
  const id = event.call_id;
  const name = event.name;

  if (!id || !name) {
    return;
  }

  if (event.status === 'running') {
    if (openTools.has(id)) {
      return;
    }

    const call: ToolCallItem = {id, name, input: event.args ?? {}};
    openTools.set(id, call);
    sink.startTool(call);
    return;
  }

  if (event.status === 'completed' || event.status === 'error') {
    const call = openTools.get(id) ?? {id, name, input: event.args ?? {}};
    if (!openTools.has(id)) {
      sink.startTool(call);
    }
    openTools.delete(id);
    const output = formatCursorToolOutput(event.result);
    const toolOptions: FinishToolOptions = {
      toolName: call.name,
      toolInput: call.input
    };

    if (event.status === 'error') {
      sink.finishTool(id, output, {...toolOptions, error: output || '工具执行失败'});
      return;
    }

    sink.finishTool(id, output, toolOptions);
  }
}

export function mapCursorStreamEvent(
  event: CursorSdkMessage,
  sink: CursorStreamMapperSink,
  openTools: Map<string, ToolCallItem>
): CursorStreamEventResult {
  if (event.type === 'usage' && event.usage) {
    sink.recordTokenUsage(normalizeCursorUsage(event.usage));
    return CursorStreamEventResult.Usage;
  }

  if (event.type === 'tool_call') {
    mapToolCallEvent(sink, event, openTools);
    return CursorStreamEventResult.Tool;
  }

  if (event.type === 'thinking' && event.text) {
    sink.showThinking(event.text);
    return CursorStreamEventResult.Thinking;
  }

  const text = extractCursorText(event);

  if (!text) {
    return CursorStreamEventResult.Skip;
  }

  if (event.type === 'assistant' || event.type === 'message' || (!event.type && text)) {
    sink.appendAssistantDelta(text);
    return CursorStreamEventResult.Text;
  }

  return CursorStreamEventResult.Skip;
}

export function shouldStartAssistantStream(event: CursorSdkMessage): boolean {
  if (event.type && event.type !== 'assistant' && event.type !== 'message') {
    return false;
  }

  return extractCursorText(event).length > 0;
}
