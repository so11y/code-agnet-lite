import type {AgentPlugin} from './types.js';

export function skillCatalogPlugin(): AgentPlugin {
  return {
    name: 'skill-catalog',
    enforce: 'pre',

    async sessionReady(ctx) {
      await ctx.session.skills.mountCatalog(ctx.cwd);
    },

    async workspaceChange(ctx) {
      ctx.session.skills.resetWorkspace();
      await ctx.session.skills.mountCatalog(ctx.cwd);
    }
  };
}
