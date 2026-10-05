import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnModuleInit } from '@nestjs/common';
import { ApplicationException } from '../../../core/common/application.exception';
import { PAGES_REPOSITORY } from './pages-repository.port';
import type { PageAgentInput, PagesRepository } from './pages-repository.port';

@Injectable()
export class FacebookPagesService implements OnModuleInit {
  constructor(
    @Inject(PAGES_REPOSITORY) private readonly repository: PagesRepository,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const pageId = this.config.get<string>('META_PAGE_ID')?.trim();
    if (pageId) await this.repository.upsertConfiguredPage(pageId);
  }

  list() {
    return this.repository.listPages();
  }

  async listAgents(pageId: string) {
    const agents = await this.repository.listPageAgents(pageId);
    if (!agents) {
      throw new ApplicationException(
        'FACEBOOK_PAGE_NOT_FOUND',
        'Facebook Page not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return agents;
  }

  async assignAgent(input: PageAgentInput) {
    const result = await this.repository.assignAgent(input);
    if (result === 'page_missing') {
      throw new ApplicationException(
        'FACEBOOK_PAGE_NOT_FOUND',
        'Facebook Page not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (result === 'agent_missing') {
      throw new ApplicationException(
        'AGENT_NOT_FOUND',
        'An active agent account is required.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { pageId: input.pageId, agentId: input.agentId, isEnabled: true };
  }

  async removeAgent(input: Omit<PageAgentInput, 'maxActiveConversations'>) {
    const removed = await this.repository.removeAgent(input);
    if (!removed) {
      throw new ApplicationException(
        'AGENT_NOT_ASSIGNED_TO_PAGE',
        'The agent is not associated with this Facebook Page.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { pageId: input.pageId, agentId: input.agentId, removed: true };
  }
}
