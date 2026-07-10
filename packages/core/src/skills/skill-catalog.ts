import type {AgentSession} from '../session.js';

/** @deprecated 使用 session.skills.mountCatalog */
export async function mountSkillCatalog(session: AgentSession, cwd: string): Promise<void> {
  await session.skills.mountCatalog(cwd);
}
