import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  disabled: boolean;
  onSubmit(value: string): void;
};

export function InputBox({disabled, onSubmit}: Props) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue('');
      }
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
      setValue((current) => `${current}${input}`);
    }
  });

  return (
    <Box borderStyle="round" borderColor={disabled ? 'gray' : 'cyan'} paddingX={1} minWidth={40}>
      <Text color="gray">输入 </Text>
      {disabled ? (
        <Text color="gray">正在处理…</Text>
      ) : value ? (
        <>
          <Text>{value}</Text>
          <Text color="cyan">▌</Text>
        </>
      ) : (
        <Text dimColor>请输入问题，按 Enter 发送</Text>
      )}
    </Box>
  );
}
