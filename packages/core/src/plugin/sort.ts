import {partition} from 'lodash-es';
import type {AgentPlugin} from './types.js';

export function sortPlugins(plugins: AgentPlugin[]): AgentPlugin[] {
  const [pre, rest] = partition(plugins, (plugin) => plugin.enforce === 'pre');
  const [post, normal] = partition(rest, (plugin) => plugin.enforce === 'post');
  return [...pre, ...normal, ...post];
}
