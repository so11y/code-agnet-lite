import type {ConversationStore} from '../session/conversation-store.js';
import type {Skill, SkillMeta, SkillRegistry} from '../skill-registry.js';
import type {AgentMessage} from '../session-types.js';

export type EnsureLoadedResult = {
  skill: Skill;
  injected: boolean;
};

export class Skills {
  private readonly loaded = new Map<string, string>();
  private readonly loadedMessages: AgentMessage[] = [];
  private catalogItems: SkillMeta[] = [];

  constructor(
    readonly registry: SkillRegistry,
    private readonly conversation: ConversationStore
  ) {}

  listLoaded(): string[] {
    return [...this.loaded.keys()];
  }

  isLoaded(name: string): boolean {
    const query = name.trim().toLowerCase();
    return [...this.loaded.keys()].some((loaded) => loaded.toLowerCase() === query);
  }

  listCatalog(): SkillMeta[] {
    return this.catalogItems;
  }

  loadedPromptNotes(): string[] {
    return [...this.loaded.values()];
  }

  inheritLoaded(source: Skills): void {
    for (const [name, prompt] of source.loaded) {
      this.loaded.set(name, prompt);
      this.loadedMessages.push(this.conversation.addSystemNote(prompt, {emit: false}));
    }
  }

  inject(skill: Skill): boolean {
    if (this.isLoaded(skill.name)) {
      return false;
    }

    const prompt = this.registry.formatForPrompt(skill);
    this.loaded.set(skill.name, prompt);
    this.loadedMessages.push(this.conversation.addSystemNote(prompt, {emit: true}));
    return true;
  }

  async ensureLoaded(cwd: string, name: string): Promise<EnsureLoadedResult | undefined> {
    const skill = await this.registry.load(cwd, name);
    if (!skill) {
      return undefined;
    }

    const injected = this.inject(skill);
    return {skill, injected};
  }

  async mountCatalog(cwd: string): Promise<void> {
    if (this.conversation.isSkillCatalogSynced(cwd)) {
      return;
    }

    const items = await this.registry.discover(cwd);
    this.catalogItems = items;
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
    this.catalogItems = [];
  }

  resetWorkspace(): void {
    this.invalidateCatalog();
    this.conversation.removeMessages(this.loadedMessages);
    this.loaded.clear();
    this.loadedMessages.length = 0;
  }
}
