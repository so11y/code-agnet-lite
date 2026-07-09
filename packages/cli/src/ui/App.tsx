import path from 'node:path';
import {readFile} from 'node:fs/promises';
import React, {useCallback, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {createTokenUsage, type AgentEvent, type AgentStatus, type ChatItem, type TokenUsage} from '@code-agent-lite/core';
import {getAgentProviderKind} from '@code-agent-lite/platform';
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
import {planFromGraph, type PlanTodoState} from './plan-todo.js';
import {isInternalSystemMessage, type TranscriptItem} from './transcript.js';
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

  const updateStreamingThinking = useCallback((update: (item: ChatItem) => ChatItem) => {
    setItems((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const entry = current[index];
        if (
          entry.type === 'message' &&
          entry.item.role === 'thinking' &&
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
        case 'thinking_start':
          appendMessage({role: 'thinking', content: '', streaming: true});
          break;
        case 'thinking_delta':
          updateStreamingThinking((item) => ({
            ...item,
            content: `${item.content}${event.delta}`
          }));
          break;
        case 'thinking_end':
          updateStreamingThinking((item) => ({...item, streaming: false}));
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
        case 'dag_snapshot':
          setPlan(planFromGraph(event.graph));
          break;
        case 'task_start':
        case 'task_end':
          break;
      }
    },
    [appendMessage, updateStatus, updateStreamingAssistant, updateStreamingThinking]
  );

  const {clearSession, runTurn} = useAgentSession({onEvent});

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

  const busy = status === 'thinking' || status === 'running_tool';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const provider = getAgentProviderKind();

  const submit = useCallback(
    (input: string) => {
      if (busyRef.current) {
        return;
      }

      const displayInput = input.trim();
      if (!displayInput) {
        return;
      }

      const isNewSession = parseNewSessionCommand(displayInput);
      const workspaceTarget = parseWorkspaceCommand(displayInput);
      if (!isNewSession && !workspaceTarget) {
        appendMessage({role: 'user', content: displayInput});
      }

      void (async () => {
        let resolvedInput = input;

        const fileRef = /^@(.+)$/.exec(displayInput);
        if (fileRef) {
          try {
            const filePath = path.resolve(workspace, fileRef[1].trim());
            resolvedInput = await readFile(filePath, 'utf8');
            appendMessage({role: 'system', content: `已从文件加载：${filePath}`});
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus('error', message);
            appendMessage({role: 'system', content: `读取失败：${message}`});
            return;
          }
        }

        if (isNewSession) {
          resetSession(workspace);
          return;
        }

        if (workspaceTarget) {
          await switchWorkspace(resolvedInput, workspaceTarget);
          return;
        }

        const isMultiline = resolvedInput.includes('\n');
        const paths = isMultiline ? [] : absolutePathCandidates(resolvedInput);

        if (paths.length === 0) {
          runInWorkspace(resolvedInput, workspace);
          return;
        }

        updateStatus('thinking', paths[0]);
        const resolved = await firstDirectory(paths);
        if (!resolved) {
          const message = `工作区路径不存在或不是目录：${paths[0]}`;
          updateStatus('error', message);
          appendMessage({role: 'system', content: message});
          return;
        }

        if (resolved !== workspace) {
          setWorkspace(resolved);
          appendMessage({role: 'system', content: `工作区：${resolved}`});
        }

        runInWorkspace(resolvedInput, resolved);
      })();
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
        <InputBox disabled={busy} onSubmit={submit} />
      </Box>
    </Box>
  );
}
