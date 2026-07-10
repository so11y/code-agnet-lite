import type {ConversationStore} from '../session/conversation-store.js';
import {
  createDefaultSkillRegistry,
  type Skill,
  type SkillRegistry
} from '../skill-registry.js';

export class Skills {
  private readonly loaded_ = new Set<string>();

  constructor(
    private readonly registry: SkillRegistry,
    private readonly conversation: ConversationStore
  ) {}

  static create(conversation: ConversationStore, registry?: SkillRegistry): Skills {
    return new Skills(registry ?? createDefaultSkillRegistry(), conversation);
  }

  parseInput(input: string) {
    return this.registry.parseInput(input);
  }

  load(cwd: string, name: string) {
    return this.registry.load(cwd, name);
  }

  formatNotFound(name: string) {
    return this.registry.formatNotFound(name);
  }

  inject(skill: Skill): boolean {
    if (this.loaded_.has(skill.name)) {
      return false;
    }

    this.loaded_.add(skill.name);
    this.conversation.addSystemNote(this.registry.formatForPrompt(skill), {emit: true});
    return true;
  }

  async mountCatalog(cwd: string): Promise<void> {
    if (this.conversation.isSkillCatalogSynced(cwd)) {
      return;
    }

    const items = await this.registry.discover(cwd);
    const catalog = this.registry.formatCatalog(items);

    if (catalog) {
      this.conversation.setSkillCatalog(catalog, cwd);
    } else {
      this.conversation.clearSkillCatalog();
    }

    this.conversation.markSkillCatalogSynced(cwd);
  }

  invalidateCatalog(): void {
    this.conversation.invalidateSkillCatalog();
  }
}
