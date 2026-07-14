import {useRef} from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  disabled: boolean;
  value: string;
  onChange(value: string): void;
  onSubmit(value: string): void;
  onCancel?(): void;
  suggestionMode?: boolean;
  onSuggestionNavigate?(action: 'up' | 'down' | 'tab' | 'escape'): boolean;
};

/** 粘贴多行时，终端常在每行末尾紧跟 Enter；若距上次输入 < 80ms，视为换行而非发送 */
const PASTE_ENTER_MS = 80;

function normalizePastedText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function InputBox({
  disabled,
  value,
  onChange,
  onSubmit,
  onCancel,
  suggestionMode,
  onSuggestionNavigate
}: Props) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastInputAtRef = useRef(0);

  const setInput = (next: string) => {
    onChange(next);
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
    if (key.ctrl && input === 'c') {
      if (disabled) {
        onCancel?.();
      }
      return;
    }

    if (disabled) {
      return;
    }

    if (suggestionMode && onSuggestionNavigate) {
      if (key.upArrow && onSuggestionNavigate('up')) {
        return;
      }
      if (key.downArrow && onSuggestionNavigate('down')) {
        return;
      }
      if (key.tab && onSuggestionNavigate('tab')) {
        return;
      }
      if (key.escape && onSuggestionNavigate('escape')) {
        return;
      }
    }

    if (key.backspace || key.delete) {
      setInput(valueRef.current.slice(0, -1));
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
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={disabled ? 'gray' : 'cyan'}
      paddingX={1}
      minWidth={40}
    >
      <Text color="gray">输入 </Text>
      {disabled ? (
        <Text color="gray">正在处理… Ctrl+C 终止</Text>
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
        <Text dimColor>Enter 发送 · 输入 / 查看命令</Text>
      )}
    </Box>
  );
}
