import React, {useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  disabled: boolean;
  onSubmit(value: string): void;
};

/** 粘贴多行时，终端常在每行末尾紧跟 Enter；若距上次输入 < 80ms，视为换行而非发送 */
const PASTE_ENTER_MS = 80;

function normalizePastedText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function InputBox({disabled, onSubmit}: Props) {
  const [value, setValue] = useState('');
  const lastInputAtRef = useRef(0);

  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }

    if (key.ctrl && input === 'c') {
      return;
    }

    if (input) {
      lastInputAtRef.current = Date.now();
      const normalized = normalizePastedText(input);
      setValue((current) => `${current}${normalized}`);
    }

    if (key.return) {
      const pastedLineBreak = Date.now() - lastInputAtRef.current < PASTE_ENTER_MS;

      if (pastedLineBreak) {
        setValue((current) => `${current}\n`);
        return;
      }

      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue('');
      }
    }
  });

  const lines = value.split('\n');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={disabled ? 'gray' : 'cyan'} paddingX={1} minWidth={40}>
      <Text color="gray">输入 </Text>
      {disabled ? (
        <Text color="gray">正在处理…</Text>
      ) : value ? (
        <Box flexDirection="column">
          {lines.map((line, index) => (
            <Text key={`${index}-${line.length}`}>
              {line}
              {index === lines.length - 1 ? <Text color="cyan">▌</Text> : null}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>Enter 发送 · 可直接粘贴多行 · @prompt.txt 从文件读取</Text>
      )}
    </Box>
  );
}
