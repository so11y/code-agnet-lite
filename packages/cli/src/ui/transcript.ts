import type {ChatItem, ChatRole, ToolCallItem} from '@code-agent-lite/core';

export type TranscriptItem =
  | {type: 'message'; item: ChatItem}
  | {type: 'tool'; item: ToolCallItem};

export function isInternalSystemMessage(content: string): boolean {
  return content.startsWith('[stateΔ') || content.startsWith('[upstream]') || content.startsWith('[本节点目标]');
}

export function updateStreamingMessage(
  items: TranscriptItem[],
  role: ChatRole,
  update: (item: ChatItem) => ChatItem
): TranscriptItem[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const entry = items[index];
    if (entry.type === 'message' && entry.item.role === role && entry.item.streaming) {
      return [
        ...items.slice(0, index),
        {type: 'message', item: update(entry.item)},
        ...items.slice(index + 1)
      ];
    }
  }

  return items;
}
