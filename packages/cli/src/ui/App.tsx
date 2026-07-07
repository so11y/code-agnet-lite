import path from 'node:path';
import React, {useCallback, useState} from 'react';
import {Box, Text} from 'ink';
import {createTokenUsage, type AgentEvent, type AgentStatus, type ChatItem, type TokenUsage} from '@code-agent-lite/core';
import {
  absolutePathCandidates,
  firstDirectory,
  isDirectory,
  parseNewSessionCommand,
  parseWorkspaceCommand
} from '@code-agent-lite/platform';
import {ChatPanel} from './ChatPanel.js';
import {InputBox} from './InputBox.js';
import {StatusBar} from './StatusBar.js';
import type {TranscriptItem} from './transcript.js';
import {useAgentSession} from './useAgentSession.js';

type Props = {
  cwd: string;
};

export function App({cwd}: Props) {
  const [workspace, setWorkspace] = useState(() => path.resolve(cwd));
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(() => createTokenUsage());

  const appendMessage = useCallback((item: ChatItem) => {
    setItems((current) => [...current, {type: 'message', item}]);
  }, []);

  const updateStreamingAssistant = useCallback((update: (item: ChatItem) => ChatItem) => {
    setItems((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const entry = current[index];
        if (
          entry.type === 'message' &&
          entry.item.role === 'assistant' &&
          entry.item.streaming
        ) {
          return [
            ...current.slice(0, index),
            {type: 'message', item: update(entry.item)},
            ...current.slice(index + 1)
          ];
        }
      }

      return current;
    });
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
          updateStreamingAssistant((item) => ({
            ...item,
            content: `${item.content}${event.delta}`
          }));
          break;
        case 'message_end':
          updateStreamingAssistant((item) => ({...item, streaming: false}));
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
          setTokenUsage((current) => ({
            prompt: current.prompt + event.usage.prompt,
            completion: current.completion + event.usage.completion,
            total: current.total + event.usage.total
          }));
          break;
      }
    },
    [appendMessage, updateStatus, updateStreamingAssistant]
  );

  const {clearSession, runTurn} = useAgentSession({onEvent});

  const resetSession = useCallback(
    (cwdForSession: string) => {
      clearSession();
      setItems([]);
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
        const message = error instanceof Error ? error.message : String(error);
        updateStatus('error', message);
        appendMessage({role: 'assistant', content: message});
      });
    },
    [appendMessage, runTurn, updateStatus]
  );

  const switchWorkspace = useCallback(
    async (input: string, target: string) => {
      const resolved = path.resolve(workspace, target);
      updateStatus('thinking', resolved);
      appendMessage({role: 'user', content: input});

      try {
        if (!(await isDirectory(resolved))) {
          throw new Error(`工作区不是目录：${resolved}`);
        }

        setWorkspace(resolved);
        updateStatus('idle', resolved);
        appendMessage({role: 'system', content: `工作区：${resolved}`});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateStatus('error', message);
        appendMessage({role: 'system', content: message});
      }
    },
    [appendMessage, updateStatus, workspace]
  );

  const submit = useCallback(
    (input: string) => {
      if (parseNewSessionCommand(input)) {
        resetSession(workspace);
        return;
      }

      const nextWorkspace = parseWorkspaceCommand(input);
      if (nextWorkspace) {
        void switchWorkspace(input, nextWorkspace);
        return;
      }

      const paths = absolutePathCandidates(input);
      if (paths.length === 0) {
        runInWorkspace(input, workspace);
        return;
      }

      updateStatus('thinking', paths[0]);
      void firstDirectory(paths).then((resolved) => {
        if (!resolved) {
          const message = `工作区路径不存在或不是目录：${paths[0]}`;
          updateStatus('error', message);
          appendMessage({role: 'user', content: input});
          appendMessage({role: 'system', content: message});
          return;
        }

        if (resolved !== workspace) {
          setWorkspace(resolved);
          appendMessage({role: 'system', content: `工作区：${resolved}`});
        }

        runInWorkspace(input, resolved);
      });
    },
    [appendMessage, resetSession, runInWorkspace, switchWorkspace, updateStatus, workspace]
  );

  const busy = status === 'thinking' || status === 'running_tool';

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1}>
        <Text bold color="cyan">OpenCode Lite</Text>
        <Text color="gray">  {workspace}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <ChatPanel items={items} />
      </Box>
      <Box flexDirection="column">
        <StatusBar status={status} message={statusMessage} tokenUsage={tokenUsage} />
        <InputBox disabled={busy} onSubmit={submit} />
      </Box>
    </Box>
  );
}
