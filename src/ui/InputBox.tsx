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
    <Box borderStyle="single" borderColor={disabled ? 'gray' : 'green'} paddingX={1}>
      <Text color="green">{'> '}</Text>
      <Text>{disabled ? 'Agent is working...' : value || 'Type a task and press Enter'}</Text>
    </Box>
  );
}
