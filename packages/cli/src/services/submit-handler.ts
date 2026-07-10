import type {AgentStatus, ChatItem} from '@code-agent-lite/core';
import {resolveSubmitInput} from './resolve-submit-input.js';

export type SubmitActions = {
  workspace: string;
  appendMessage(item: ChatItem): void;
  updateStatus(status: AgentStatus, message?: string): void;
  resetSession(cwd: string): void;
  runInWorkspace(input: string, cwd: string): void;
};

export async function handleSubmit(input: string, actions: SubmitActions): Promise<void> {
  const intent = await resolveSubmitInput(input, actions.workspace);

  switch (intent.type) {
    case 'noop':
      return;

    case 'new_session':
      actions.resetSession(actions.workspace);
      return;

    case 'error':
      if (intent.userDisplay) {
        actions.appendMessage({role: 'user', content: intent.userDisplay});
      }
      actions.updateStatus('error', intent.message);
      for (const message of intent.systemMessages ?? []) {
        actions.appendMessage({role: 'system', content: message});
      }
      return;

    case 'agent_run':
      actions.appendMessage({role: 'user', content: intent.userDisplay});
      for (const message of intent.systemMessages ?? []) {
        actions.appendMessage({role: 'system', content: message});
      }
      actions.runInWorkspace(intent.content, intent.workspace);
      return;
  }
}
