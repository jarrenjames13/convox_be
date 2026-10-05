import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignmentType,
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { ApplicationException } from '../../../../core/common/application.exception';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PrismaAssignmentRepository } from '../../../assignments/infrastructure/persistence/prisma-assignment.repository';
import {
  IncomingMessageRepository,
  IncomingMessageResult,
  NormalizedIncomingMessage,
} from '../../application/incoming-message-repository.port';

const activeStatuses: ConversationStatus[] = [
  ConversationStatus.UNASSIGNED,
  ConversationStatus.ASSIGNED,
  ConversationStatus.IN_PROGRESS,
  ConversationStatus.WAITING_CUSTOMER,
];

@Injectable()
export class PrismaIncomingMessageRepository implements IncomingMessageRepository {
  private readonly reopenWindowMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: PrismaAssignmentRepository,
    config: ConfigService,
  ) {
    this.reopenWindowMs =
      config.getOrThrow<number>('CONVERSATION_REOPEN_WINDOW_HOURS') *
      60 *
      60 *
      1000;
  }

  async processMessage(
    message: NormalizedIncomingMessage,
  ): Promise<IncomingMessageResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction((transaction) =>
          this.processInTransaction(transaction, message),
        );
      } catch (error) {
        if (!isUniqueConstraint(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Incoming message processing retries exhausted.');
  }

  private async processInTransaction(
    transaction: Prisma.TransactionClient,
    message: NormalizedIncomingMessage,
  ): Promise<IncomingMessageResult> {
    const timestamp = new Date(message.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      throw new ApplicationException(
        'INVALID_META_WEBHOOK_PAYLOAD',
        'The incoming message timestamp is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const duplicate = await transaction.message.findUnique({
      where: { metaMessageId: message.metaMessageId },
      select: { id: true },
    });
    if (duplicate) return { duplicate: true };

    const page = await transaction.facebookPage.findUnique({
      where: { metaPageId: message.pageMetaId },
      select: { id: true, isActive: true },
    });
    if (!page?.isActive) {
      throw new ApplicationException(
        'FACEBOOK_PAGE_NOT_CONFIGURED',
        'The Facebook Page is not configured or active.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${message.metaMessageId}, 1))`;
    // Repeat deduplication after acquiring the message lock: another worker may
    // have committed the same event while this transaction was waiting.
    if (
      await transaction.message.findUnique({
        where: { metaMessageId: message.metaMessageId },
        select: { id: true },
      })
    ) {
      return { duplicate: true };
    }

    const contact = await transaction.contact.upsert({
      where: {
        pageId_metaPsid: { pageId: page.id, metaPsid: message.senderPsid },
      },
      create: { pageId: page.id, metaPsid: message.senderPsid },
      update: {},
      select: { id: true },
    });

    let conversation = await transaction.conversation.findFirst({
      where: {
        pageId: page.id,
        contactId: contact.id,
        status: { in: activeStatuses },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        assignedAgentId: true,
        status: true,
        lastMessageAt: true,
      },
    });
    let createdConversation = false;
    let assigned = false;

    if (!conversation) {
      const now = new Date();
      const resolved = await transaction.conversation.findFirst({
        where: {
          pageId: page.id,
          contactId: contact.id,
          status: ConversationStatus.RESOLVED,
        },
        orderBy: { resolvedAt: 'desc' },
        select: { id: true, assignedAgentId: true, resolvedAt: true },
      });
      const insideReopenWindow =
        resolved?.resolvedAt &&
        now.getTime() - resolved.resolvedAt.getTime() <= this.reopenWindowMs;

      if (resolved && insideReopenWindow) {
        const previousAgentEligible = resolved.assignedAgentId
          ? await this.isEligibleToRetain(
              transaction,
              page.id,
              resolved.assignedAgentId,
            )
          : false;
        conversation = await transaction.conversation.update({
          where: { id: resolved.id },
          data: {
            status: previousAgentEligible
              ? ConversationStatus.ASSIGNED
              : ConversationStatus.UNASSIGNED,
            assignedAgentId: previousAgentEligible
              ? resolved.assignedAgentId
              : null,
            assignedAt: previousAgentEligible ? now : null,
            resolvedAt: null,
            closedAt: null,
            openedAt: now,
          },
          select: {
            id: true,
            assignedAgentId: true,
            status: true,
            lastMessageAt: true,
          },
        });
        if (previousAgentEligible && resolved.assignedAgentId) {
          await transaction.conversationAssignment.create({
            data: {
              conversationId: resolved.id,
              fromAgentId: resolved.assignedAgentId,
              toAgentId: resolved.assignedAgentId,
              assignmentType: AssignmentType.REOPEN,
            },
          });
          assigned = true;
        } else {
          const assignment =
            await this.assignments.assignRoundRobinInTransaction(
              transaction,
              conversation.id,
            );
          assigned = assignment.status === 'assigned';
          if (assignment.status === 'assigned') {
            conversation.assignedAgentId = assignment.toAgentId ?? null;
            conversation.status = ConversationStatus.ASSIGNED;
          }
        }
      } else {
        conversation = await transaction.conversation.create({
          data: { pageId: page.id, contactId: contact.id },
          select: {
            id: true,
            assignedAgentId: true,
            status: true,
            lastMessageAt: true,
          },
        });
        createdConversation = true;
        const assignment = await this.assignments.assignRoundRobinInTransaction(
          transaction,
          conversation.id,
        );
        assigned = assignment.status === 'assigned';
        if (assignment.status === 'assigned') {
          conversation.assignedAgentId = assignment.toAgentId ?? null;
          conversation.status = ConversationStatus.ASSIGNED;
        }
      }
    }

    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM conversations WHERE id = ${conversation.id}::uuid FOR UPDATE
    `;
    const lockedConversation = await transaction.conversation.findUniqueOrThrow(
      {
        where: { id: conversation.id },
        select: { lastMessageAt: true, assignedAgentId: true },
      },
    );
    const messageRecord = await transaction.message.create({
      data: {
        conversationId: conversation.id,
        metaMessageId: message.metaMessageId,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CUSTOMER,
        messageType: message.messageType,
        content: message.content,
        metadata: message.metadata as Prisma.InputJsonValue | undefined,
        sentAt: timestamp,
      },
      select: { id: true, content: true, messageType: true, sentAt: true },
    });
    await transaction.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(lockedConversation.lastMessageAt &&
        lockedConversation.lastMessageAt > timestamp
          ? {}
          : { lastMessageAt: timestamp }),
      },
    });

    return {
      duplicate: false,
      conversationId: conversation.id,
      pageId: page.id,
      assignedAgentId: lockedConversation.assignedAgentId,
      message: {
        id: messageRecord.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: messageRecord.content,
        messageType: messageRecord.messageType,
        sentAt: messageRecord.sentAt,
      },
      createdConversation,
      assigned,
    };
  }

  private async isEligibleToRetain(
    transaction: Prisma.TransactionClient,
    pageId: string,
    agentId: string,
  ): Promise<boolean> {
    await transaction.$queryRaw`SELECT user_id FROM agent_profiles WHERE user_id = ${agentId}::uuid FOR UPDATE`;
    const membership = await transaction.pageAgent.findUnique({
      where: { pageId_agentId: { pageId, agentId } },
      include: {
        agent: {
          include: { user: { select: { isActive: true, role: true } } },
        },
      },
    });
    if (
      !membership?.isEnabled ||
      !membership.agent.acceptingConversations ||
      !membership.agent.user.isActive ||
      membership.agent.user.role !== UserRole.AGENT
    ) {
      return false;
    }
    const workload = await transaction.conversation.count({
      where: {
        assignedAgentId: agentId,
        ...(membership.maxActiveConversations === null ? {} : { pageId }),
        status: { in: activeStatuses },
      },
    });
    const maximum =
      membership.maxActiveConversations ??
      membership.agent.maxActiveConversations;
    return workload < maximum;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
