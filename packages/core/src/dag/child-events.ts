import type {AgentEvent, AgentSessionOptions} from '../session-types.js';
import type {AgentSession} from '../session.js';

export function createChildEventBridge(
  parentSession: AgentSession,
  label?: string
): AgentSessionOptions['onEvent'] {
  let previousTokenUsage = {prompt: 0, completion: 0, total: 0};
  let thinking = '';
  const forwardThinking = (content: string) => {
    parentSession.events.say('thinking', label ? `[${label}]\n${content}` : content);
  };

  return (event: AgentEvent) => {
    switch (event.type) {
      case 'status':
      case 'tool_end':
        parentSession.events.emit(event);
        break;
      case 'token_usage': {
        const delta = {
          prompt: Math.max(0, event.usage.prompt - previousTokenUsage.prompt),
          completion: Math.max(0, event.usage.completion - previousTokenUsage.completion),
          total: Math.max(0, event.usage.total - previousTokenUsage.total),
          contextUsed: event.usage.contextUsed,
          contextLimit: event.usage.contextLimit
        };
        previousTokenUsage = event.usage;
        parentSession.events.recordTokenUsage(delta);
        break;
      }
      case 'thinking_start':
        thinking = '';
        break;
      case 'thinking_delta':
        thinking += event.delta;
        break;
      case 'thinking_end':
        if (thinking.trim()) {
          forwardThinking(thinking);
        }
        thinking = '';
        break;
      case 'message':
        if (event.role === 'thinking') {
          forwardThinking(event.content);
        }
        break;
      case 'tool_start':
        parentSession.events.emit({
          type: 'tool_start',
          call: label ? {...event.call, name: `${label}:${event.call.name}`} : event.call
        });
        break;
      default:
        break;
    }
  };
}
