import path from 'node:path';
import React, {useCallback, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {createTokenUsage, isAgentBusy, type AgentEvent, type AgentStatus, type ChatItem, type TokenUsage} from '@code-agent-lite/core';
import {getAgentProviderKind, resolveWorkspaceDirectory} from '@code-agent-lite/platform';
import {formatError, isAbortError} from '@code-agent-lite/shared';
import {handleSubmit} from '../services/submit-handler.js';
import {ChatPanel} from './ChatPanel.js';
import {InputBox} from './InputBox.js';
import {StatusBar} from './StatusBar.js';
import {planFromGraph, type PlanTodoState} from './plan-todo.js';
import {isInternalSystemMessage, updateStreamingMessage, type TranscriptItem} from './transcript.js';
import {useAgentSession} from './useAgentSession.js';

type Props = {
  cwd: string;
};

export function App({cwd}: Props) {
  const [workspace, setWorkspace] = useState(() => path.resolve(cwd));
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [plan, setPlan] = useState<PlanTodoState | undefined>();
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(() => createTokenUsage());

  const appendMessage = useCallback((item: ChatItem) => {
    if (item.role === 'system' && isInternalSystemMessage(item.content)) {
      return;
    }

    setItems((current) => [...current, {type: 'message', item}]);
  }, []);

  const updateStreamingByRole = useCallback((role: ChatItem['role'], update: (item: ChatItem) => ChatItem) => {
    setItems((current) => updateStreamingMessage(current, role, update));
  }, []);

  const updateStatus = useCallback((next: AgentStatus, message?: string) => {
    setStatus(next);
    setStatusMessage(message);
  }, []);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          updateStatus(event.status, event.message);
          break;
        case 'message':
          appendMessage({role: event.role, content: event.content});
          break;
        case 'message_start':
          appendMessage({role: event.role, content: '', streaming: true});
          break;
        case 'message_delta':
          updateStreamingByRole('assistant', (item) => ({
            ...item,
            content: `${item.content}${event.delta}`
          }));
          break;
        case 'message_end':
          updateStreamingByRole('assistant', (item) => ({...item, streaming: false}));
          break;
        case 'thinking_start':
          appendMessage({role: 'thinking', content: '', streaming: true});
          break;
        case 'thinking_delta':
          updateStreamingByRole('thinking', (item) => ({
            ...item,
            content: `${item.content}${event.delta}`
          }));
          break;
        case 'thinking_end':
          updateStreamingByRole('thinking', (item) => ({...item, streaming: false}));
          break;
        case 'workspace':
          setWorkspace(event.cwd);
          setStatusMessage(event.cwd);
          appendMessage({role: 'system', content: `工作区：${event.cwd}`});
          break;
        case 'tool_start':
          setItems((current) => [...current, {type: 'tool', item: event.call}]);
          break;
        case 'tool_end':
          setItems((current) =>
            current.map((item) =>
              item.type === 'tool' && item.item.id === event.id
                ? {type: 'tool', item: {...item.item, output: event.output, error: event.error}}
                : item
            )
          );
          break;
        case 'token_usage':
          setTokenUsage(event.usage);
          break;
        case 'dag_snapshot':
          setPlan(planFromGraph(event.graph));
          break;
        case 'task_start':
        case 'task_end':
          break;
      }
    },
    [appendMessage, updateStatus, updateStreamingByRole]
  );

  const {clearSession, cancelTurn, runTurn} = useAgentSession({onEvent});

  const resetSession = useCallback(
    (cwdForSession: string) => {
      clearSession();
      setItems([]);
      setPlan(undefined);
      setTokenUsage(createTokenUsage());
      updateStatus('idle', cwdForSession);
      appendMessage({role: 'system', content: '已开始新对话'});
    },
    [appendMessage, clearSession, updateStatus]
  );

  const runInWorkspace = useCallback(
    (input: string, cwdForRun: string) => {
      updateStatus('thinking', cwdForRun);
      void runTurn(input, cwdForRun).catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        const message = formatError(error);
        updateStatus('error', message);
        appendMessage({role: 'assistant', content: message});
      });
    },
    [appendMessage, runTurn, updateStatus]
  );

  const switchWorkspace = useCallback(
    async (input: string, target: string) => {
      updateStatus('thinking', target);
      appendMessage({role: 'user', content: input});

      try {
        const resolved = await resolveWorkspaceDirectory(workspace, target);
        setWorkspace(resolved);
        updateStatus('idle', resolved);
        appendMessage({role: 'system', content: `工作区：${resolved}`});
      } catch (error) {
        const message = formatError(error);
        updateStatus('error', message);
        appendMessage({role: 'system', content: message});
      }
    },
    [appendMessage, updateStatus, workspace]
  );

  const busy = isAgentBusy(status);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const provider = getAgentProviderKind();

  const submit = useCallback(
    (input: string) => {
      if (busyRef.current) {
        return;
      }

      void handleSubmit(input, {
        workspace,
        appendMessage,
        updateStatus,
        setWorkspace,
        resetSession,
        switchWorkspace,
        runInWorkspace
      });
    },
    [appendMessage, resetSession, runInWorkspace, switchWorkspace, updateStatus, workspace]
  );

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1}>
        <Text bold color="cyan">OpenCode Lite</Text>
        <Text color="gray">  {workspace}</Text>
        <Text color="gray">  · provider: {provider}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <ChatPanel items={items} plan={plan} />
      </Box>
      <Box flexDirection="column">
        <StatusBar status={status} message={statusMessage} tokenUsage={tokenUsage} />
        <InputBox disabled={busy} onSubmit={submit} onCancel={cancelTurn} />
      </Box>
    </Box>
  );
}
