import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  PageAgentInput,
  PagesRepository,
} from '../../application/pages-repository.port';

@Injectable()
export class PrismaPagesRepository implements PagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPages(): Promise<unknown[]> {
    return this.prisma.facebookPage.findMany({
      select: {
        id: true,
        metaPageId: true,
        name: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async listPageAgents(pageId: string): Promise<unknown[] | null> {
    const page = await this.prisma.facebookPage.findUnique({
      where: { id: pageId },
      select: { id: true },
    });
    if (!page) return null;
    return this.prisma.pageAgent.findMany({
      where: { pageId },
      include: {
        agent: {
          select: {
            presenceStatus: true,
            acceptingConversations: true,
            maxActiveConversations: true,
            user: {
              select: { id: true, email: true, fullName: true, isActive: true },
            },
          },
        },
      },
      orderBy: { agent: { user: { fullName: 'asc' } } },
    });
  }

  async upsertConfiguredPage(metaPageId: string): Promise<void> {
    await this.prisma.facebookPage.upsert({
      where: { metaPageId },
      create: { metaPageId, name: 'Development Facebook Page' },
      update: {},
    });
  }

  assignAgent(
    input: PageAgentInput,
  ): Promise<'ok' | 'page_missing' | 'agent_missing'> {
    return this.prisma.$transaction(async (transaction) => {
      const page = await transaction.facebookPage.findUnique({
        where: { id: input.pageId },
        select: { id: true },
      });
      if (!page) return 'page_missing';
      const agent = await transaction.user.findFirst({
        where: {
          id: input.agentId,
          role: 'AGENT',
          isActive: true,
          agentProfile: { isNot: null },
        },
        select: { id: true },
      });
      if (!agent) return 'agent_missing';

      await transaction.pageAgent.upsert({
        where: {
          pageId_agentId: { pageId: input.pageId, agentId: input.agentId },
        },
        create: {
          pageId: input.pageId,
          agentId: input.agentId,
          maxActiveConversations: input.maxActiveConversations,
        },
        update: {
          isEnabled: true,
          maxActiveConversations: input.maxActiveConversations,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'page.agent_assigned',
          resourceType: 'facebook_page',
          resourceId: input.pageId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { agentId: input.agentId } satisfies Prisma.InputJsonValue,
        },
      });
      return 'ok';
    });
  }

  removeAgent(
    input: Omit<PageAgentInput, 'maxActiveConversations'>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.pageAgent.deleteMany({
        where: { pageId: input.pageId, agentId: input.agentId },
      });
      if (result.count === 0) return false;
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'page.agent_removed',
          resourceType: 'facebook_page',
          resourceId: input.pageId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { agentId: input.agentId } satisfies Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }
}
