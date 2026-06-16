import type {ChatItem, ToolCallItem} from '../agent/types.js';

export type TranscriptItem =
  | {type: 'message'; item: ChatItem}
  | {type: 'tool'; item: ToolCallItem};
