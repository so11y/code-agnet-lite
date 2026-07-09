import React from 'react';
import {Box, Text} from 'ink';
import type {SkillMeta} from '@code-agent-lite/core';
import {
  filterCommands,
  filterSkills,
  parseSuggestionContext,
  type CommandHint
} from './command-suggestions.js';

type Props = {
  input: string;
  skills: SkillMeta[];
  selectedIndex?: number;
};

function CommandRow({item, active}: {item: CommandHint; active?: boolean}) {
  return (
    <Text>
      <Text color={active ? 'cyan' : 'yellow'} bold={active}>
        {item.command.padEnd(14)}
      </Text>
      <Text color="gray">{item.description}</Text>
      {item.example ? <Text dimColor>  {item.example}</Text> : null}
    </Text>
  );
}

function SkillRow({skill, active}: {skill: SkillMeta; active?: boolean}) {
  return (
    <Text>
      <Text color={active ? 'cyan' : 'yellow'} bold={active}>
        {skill.name.padEnd(14)}
      </Text>
      <Text color="gray">{skill.description || '（无描述）'}</Text>
    </Text>
  );
}

export function CommandSuggestionsPanel({input, skills, selectedIndex = 0}: Props) {
  const context = parseSuggestionContext(input);

  if (!context) {
    return null;
  }

  if (context.type === 'commands') {
    const commands = filterCommands(context.filter);

    if (commands.length === 0) {
      return (
        <Box borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
          <Text color="gray">无匹配命令</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text color="gray" dimColor>
          命令 · ↑↓ 选择 · Tab 补全 · Esc 关闭
        </Text>
        {commands.map((item, index) => (
          <CommandRow key={item.command} item={item} active={index === selectedIndex} />
        ))}
      </Box>
    );
  }

  const matched = filterSkills(skills, context.filter);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Text color="gray" dimColor>
        Skill · ↑↓ 选择 · Tab 补全 · Esc 关闭
      </Text>
      {matched.length === 0 ? (
        <Text color="gray">无匹配 Skill</Text>
      ) : (
        matched.slice(0, 8).map((skill, index) => (
          <SkillRow key={skill.dirName} skill={skill} active={index === selectedIndex} />
        ))
      )}
    </Box>
  );
}
