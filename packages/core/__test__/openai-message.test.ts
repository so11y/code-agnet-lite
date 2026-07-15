import {describe, expect, it} from 'vitest';
import {agentMessageText, formatSessionTranscript} from '../src/openai-message.js';
import type {AgentMessage} from '../src/session-types.js';

describe('AI SDK message text', () => {
  it('keeps tool output in planner transcripts', () => {
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_file',
            input: {path: 'package.json'}
          }
        ]
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'read_file',
            output: {type: 'text', value: '{"name":"demo"}'}
          }
        ]
      }
    ];

    expect(agentMessageText(messages[1])).toBe('{"name":"demo"}');
    expect(formatSessionTranscript(messages)).toContain('tool: {"name":"demo"}');
  });

  it('formats JSON and error tool outputs', () => {
    const jsonMessage: AgentMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'inspect',
          output: {type: 'json', value: {ok: true}}
        }
      ]
    };
    const errorMessage: AgentMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-2',
          toolName: 'inspect',
          output: {type: 'error-text', value: 'failed'}
        }
      ]
    };

    expect(agentMessageText(jsonMessage)).toBe('{"ok":true}');
    expect(agentMessageText(errorMessage)).toBe('failed');
  });
});
