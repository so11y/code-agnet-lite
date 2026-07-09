import React from 'react';
import {Box, Text} from 'ink';
import {STATIC_COMMANDS} from './command-suggestions.js';

const shortcuts = [
  {key: 'Enter', desc: '发送消息'},
  {key: '粘贴', desc: '支持多行文本'},
  {key: '@文件路径', desc: '从文件读取 prompt'},
  {key: '/', desc: '查看可用命令'}
];

export function WelcomeHints() {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} paddingY={2}>
      <Text bold color="cyan">
        输入问题开始对话
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {shortcuts.map((item) => (
          <Text key={item.key} color="gray">
            {'  '}
            <Text color="cyan">{item.key.padEnd(10)}</Text>
            {item.desc}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={2} borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
        <Text color="gray" bold>
          可用命令
        </Text>
        {STATIC_COMMANDS.map((item) => (
          <Text key={item.command} color="gray">
            {'  '}
            <Text color="yellow">{item.command.padEnd(12)}</Text>
            {item.description}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
