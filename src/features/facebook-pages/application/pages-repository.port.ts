export const PAGES_REPOSITORY = Symbol('PAGES_REPOSITORY');

export interface PageAgentInput {
  pageId: string;
  agentId: string;
  maxActiveConversations?: number;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PagesRepository {
  listPages(): Promise<unknown[]>;
  listPageAgents(pageId: string): Promise<unknown[] | null>;
  upsertConfiguredPage(metaPageId: string): Promise<void>;
  assignAgent(
    input: PageAgentInput,
  ): Promise<'ok' | 'page_missing' | 'agent_missing'>;
  removeAgent(
    input: Omit<PageAgentInput, 'maxActiveConversations'>,
  ): Promise<boolean>;
}
