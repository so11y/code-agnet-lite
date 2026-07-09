import type {AgentSession} from '../session.js';

export async function ensureSkillCatalog(session: AgentSession, cwd: string): Promise<void> {
  const registry = session.skillRegistry;
  const skills = await registry.discover(cwd);
  const catalog = registry.formatCatalog(skills);

  if (catalog) {
    session.setSkillCatalog(catalog, cwd);
    return;
  }

  session.clearSkillCatalog();
}
