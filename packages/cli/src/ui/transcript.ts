import type {ChatItem, ToolCallItem} from '@code-agent-lite/core';
import type {PlanTodoState} from './plan-todo.js';

export type TranscriptItem =
  | {type: 'message'; item: ChatItem}
  | {type: 'tool'; item: ToolCallItem};

export function isInternalSystemMessage(content: string): boolean {
  return content.startsWith('[stateΔ') || content.startsWith('[upstream]') || content.startsWith('[本节点目标]');
}
