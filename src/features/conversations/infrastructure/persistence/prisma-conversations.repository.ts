import { Injectable } from '@nestjs/common';
import { ConversationStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  ConversationActor,
  ConversationFilters,
  ConversationView,
  ConversationsRepository,
  StatusChangeResult,
} from '../../application/conversations-repository.port';
import { canTransitionConversationStatus } from '../../domain/status-transition';

const listInclude = {
  contact: { select: { id: true, displayName: true, profilePictureUrl: true } },
  page: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, fullName: true, role: true } },
  messages: {
    take: 1,
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      direction: true,
      messageType: true,
      content: true,
      sentAt: true,
    },
  },
} satisfies Prisma.ConversationInclude;

const detailInclude = {
  contact: { select: { id: true, displayName: true, profilePictureUrl: true } },
  page: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, fullName: true, role: true } },
  assignments: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      fromAgent: { select: { id: true, fullName: true } },
      toAgent: { select: { id: true, fullName: true } },
      assignedBy: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class PrismaConversationsRepository implements ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: ConversationActor, filters: ConversationFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const where: Prisma.ConversationWhereInput = {
      ...(actor.role === UserRole.AGENT
        ? { assignedAgentId: actor.id }
        : filters.assignedAgentId
          ? { assignedAgentId: filters.assignedAgentId }
          : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.pageId ? { pageId: filters.pageId } : {}),
      ...(filters.search
        ? {
            contact: {
              displayName: { contains: filters.search, mode: 'insensitive' },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: listInclude,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  findById(id: string): Promise<ConversationView | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  changeStatus(input: {
    conversationId: string;
    status: ConversationStatus;
    actor: ConversationActor;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<StatusChangeResult> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE
      `;
      if (!locked.length) return { status: 'missing' };

      const current = await transaction.conversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        select: { status: true, assignedAgentId: true },
      });
      if (
        input.actor.role === UserRole.AGENT &&
        current.assignedAgentId !== input.actor.id
      ) {
        return { status: 'not_assigned' };
      }
      if (
        !canTransitionConversationStatus(
          current.status,
          input.status,
          input.actor.role,
        )
      ) {
        return { status: 'invalid_transition' };
      }

      if (current.status !== input.status) {
        const now = new Date();
        await transaction.conversation.update({
          where: { id: input.conversationId },
          data: {
            status: input.status,
            ...(input.status === ConversationStatus.RESOLVED
              ? { resolvedAt: now }
              : {}),
            ...(input.status === ConversationStatus.CLOSED
              ? { closedAt: now }
              : {}),
          },
        });
        if (
          input.status === ConversationStatus.RESOLVED ||
          input.status === ConversationStatus.CLOSED
        ) {
          await transaction.auditLog.create({
            data: {
              actorUserId: input.actor.id,
              action:
                input.status === ConversationStatus.RESOLVED
                  ? 'conversation.resolved'
                  : 'conversation.closed',
              resourceType: 'conversation',
              resourceId: input.conversationId,
              ipAddress: input.ipAddress,
              userAgent: input.userAgent,
            },
          });
        }
      }
      const conversation = await transaction.conversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        include: detailInclude,
      });
      return { status: 'updated', conversation };
    });
  }
}
