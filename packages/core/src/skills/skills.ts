import type {ConversationStore} from '../session/conversation-store.js';
import type {Skill, SkillMeta, SkillRegistry} from '../skill-registry.js';
import type {AgentMessage} from '../session-types.js';

export type EnsureLoadedResult = {
  skill: Skill;
  injected: boolean;
};

export class Skills {
  private readonly loaded_ = new Set<string>();
  private readonly loadedMessages_: AgentMessage[] = [];
  private readonly loadedPrompts_: string[] = [];
  private catalogItems_: SkillMeta[] = [];

  constructor(
    readonly registry: SkillRegistry,
    private readonly conversation: ConversationStore
  ) {}

  listLoaded(): string[] {
    return [...this.loaded_];
  }

  isLoaded(name: string): boolean {
    const query = name.trim().toLowerCase();
    return [...this.loaded_].some((loaded) => loaded.toLowerCase() === query);
  }

  listCatalog(): SkillMeta[] {
    return this.catalogItems_;
  }

  loadedPromptNotes(): string[] {
    return [...this.loadedPrompts_];
  }

  inject(skill: Skill): boolean {
    if (this.isLoaded(skill.name)) {
      return false;
    }

    const prompt = this.registry.formatForPrompt(skill);
    this.loaded_.add(skill.name);
    this.loadedPrompts_.push(prompt);
    this.loadedMessages_.push(this.conversation.addSystemNote(prompt, {emit: true}));
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
    this.catalogItems_ = items;
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
    this.catalogItems_ = [];
  }

  resetWorkspace(): void {
    this.invalidateCatalog();
    this.conversation.removeMessages(this.loadedMessages_);
    this.loaded_.clear();
    this.loadedMessages_.length = 0;
    this.loadedPrompts_.length = 0;
  }
}
