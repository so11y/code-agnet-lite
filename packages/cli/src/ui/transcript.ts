import type {ChatItem, ToolCallItem} from '@code-agent-lite/core';

export type TranscriptItem =
  | {type: 'message'; item: ChatItem}
  | {type: 'tool'; item: ToolCallItem};
