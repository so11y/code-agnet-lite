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
  const valueRef = useRef('');
  const lastInputAtRef = useRef(0);

  const setInput = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  const submitInput = () => {
    const trimmed = valueRef.current.trim();
    if (!trimmed) {
      return;
    }

    setInput('');
    onSubmit(trimmed);
  };

  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.backspace || key.delete) {
      setInput(valueRef.current.slice(0, -1));
      return;
    }

    if (key.ctrl && input === 'c') {
      return;
    }

    const isEnter = key.return || (Boolean(input) && /^[\r\n]+$/.test(input));

    if (isEnter) {
      const pastedLineBreak = Date.now() - lastInputAtRef.current < PASTE_ENTER_MS;

      if (pastedLineBreak) {
        setInput(`${valueRef.current}\n`);
        return;
      }

      submitInput();
      return;
    }

    if (input) {
      lastInputAtRef.current = Date.now();
      setInput(`${valueRef.current}${normalizePastedText(input)}`);
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
