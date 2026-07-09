import type {AgentPlugin} from './types.js';

export function sortPlugins(plugins: AgentPlugin[]): AgentPlugin[] {
  const pre: AgentPlugin[] = [];
  const normal: AgentPlugin[] = [];
  const post: AgentPlugin[] = [];

  for (const plugin of plugins) {
    if (plugin.enforce === 'pre') {
      pre.push(plugin);
      continue;
    }

    if (plugin.enforce === 'post') {
      post.push(plugin);
      continue;
    }

    normal.push(plugin);
  }

  return [...pre, ...normal, ...post];
}
