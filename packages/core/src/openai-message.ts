import type {AgentMessage} from './session-types.js';

export function messageText(content: AgentMessage['content']): string | undefined {
  if (typeof content === 'string') {
    return content || undefined;
  }

  const text = content
    .flatMap((part) => {
      if ('text' in part && typeof part.text === 'string') {
        return [part.text];
      }

      if (part.type !== 'tool-result') {
        return [];
      }

      const output = part.output;
      if (output.type === 'text' || output.type === 'error-text') {
        return [output.value];
      }
      if (output.type === 'json' || output.type === 'error-json') {
        return [JSON.stringify(output.value)];
      }
      if (output.type === 'execution-denied') {
        return output.reason ? [output.reason] : [];
      }

      return output.value.flatMap((item) => (item.type === 'text' ? [item.text] : []));
    })
    .join('');
  return text || undefined;
}

export function agentMessageText(message: AgentMessage): string {
  const content = messageText(message.content);
  if (content) {
    return content;
  }

  if (message.role === 'assistant' && Array.isArray(message.content)) {
    const toolNames = message.content.flatMap((part) =>
      part.type === 'tool-call' ? [part.toolName] : []
    );
    if (toolNames.length) {
      return `工具调用：${toolNames.join('、')}`;
    }
  }

  return '';
}

export function formatSessionTranscript(messages: AgentMessage[]): string {
  return messages
    .map((message) => `${message.role}: ${agentMessageText(message)}`)
    .filter((line) => line.trim())
    .join('\n');
}
