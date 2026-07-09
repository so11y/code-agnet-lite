import React from 'react';
import {Box, Text} from 'ink';
import {Spinner} from './Spinner.js';
import {compactText} from '@code-agent-lite/shared';
import {
  countFinished,
  kindLabel,
  type PlanTodoItem,
  type PlanTodoState
} from './plan-todo.js';

type Props = {
  plan: PlanTodoState;
};

function PlanTodoRow({item}: {item: PlanTodoItem}) {
  const finished = item.status === 'done' || item.status === 'skipped';
  const failed = item.status === 'failed';

  return (
    <Box flexDirection="column" marginTop={0} paddingLeft={1}>
      <Text>
        {item.status === 'running' ? (
          <>
            <Text color="blue">
              <Spinner />
            </Text>
            <Text> </Text>
          </>
        ) : (
          <Text color={failed ? 'red' : finished ? 'green' : 'gray'}>
            {item.status === 'done' ? '✓ ' : item.status === 'failed' ? '✗ ' : item.status === 'skipped' ? '– ' : '○ '}
          </Text>
        )}
        <Text color="gray">[{kindLabel(item.kind)}] </Text>
        <Text color={failed ? 'red' : finished ? 'gray' : 'white'} dimColor={finished}>
          {compactText(item.goal, 100)}
        </Text>
      </Text>
      {item.error ? (
        <Text color="red" dimColor>
          {'  '}
          {compactText(item.error, 120)}
        </Text>
      ) : null}
    </Box>
  );
}

export function PlanTodoPanel({plan}: Props) {
  const finished = countFinished(plan.items);
  const total = plan.items.length;
  const allDone = total > 0 && finished === total;
  const hasFailed = plan.items.some((item) => item.status === 'failed');
  const running = plan.items.find((item) => item.status === 'running');

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor="gray">
      <Text bold color="white">
        任务计划
      </Text>
      {plan.summary ? (
        <Text color="gray" wrap="wrap">
          {plan.summary}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text>
          <Text color={hasFailed ? 'red' : allDone ? 'green' : 'yellow'}>
            {hasFailed ? '✗' : allDone ? '✓' : '◐'}
          </Text>
          <Text color="gray"> 已完成 {finished}/{total} 项</Text>
          {running ? (
            <Text color="blue"> · 进行中：{compactText(running.goal, 40)}</Text>
          ) : null}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {plan.items.map((item) => (
          <PlanTodoRow key={item.id} item={item} />
        ))}
      </Box>
    </Box>
  );
}
