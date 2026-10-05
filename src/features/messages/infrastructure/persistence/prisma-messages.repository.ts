import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  MessageType,
} from '@prisma/client';
import { ApplicationException } from '../../../../core/common/application.exception';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  MessagesRepository,
  ReplyContext,
} from '../../application/messages-repository.port';
import type { SendTextMessageResult } from '../../application/messenger-client.port';
import type { AuthenticatedUser } from '../../../../core/security/current-user.decorator';

@Injectable()
export class PrismaMessagesRepository implements MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  sendReply(
    input: {
      conversationId: string;
      senderId: string;
      content: string;
    },
    send: (
      context: ReplyContext,
      actor: AuthenticatedUser,
    ) => Promise<SendTextMessageResult>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE
      `;
        const conversation = await transaction.conversation.findUnique({
          where: { id: input.conversationId },
          include: {
            page: { select: { id: true, metaPageId: true, isActive: true } },
            contact: { select: { metaPsid: true } },
            messages: {
              where: { direction: 'INBOUND' },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { sentAt: true },
            },
          },
        });
        if (!conversation) {
          throw new ApplicationException(
            'CONVERSATION_NOT_FOUND',
            'Conversation not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        const actor = await transaction.user.findUnique({
          where: { id: input.senderId },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
          },
        });
        if (!actor?.isActive)
          throw new ApplicationException(
            'UNAUTHORIZED',
            'Authentication required.',
            HttpStatus.UNAUTHORIZED,
          );
        const context: ReplyContext = {
          id: conversation.id,
          status: conversation.status,
          assignedAgentId: conversation.assignedAgentId,
          page: conversation.page,
          contact: conversation.contact,
          latestInboundAt: conversation.messages[0]?.sentAt ?? null,
        };
        // The conversation remains locked across authorization, external send,
        // and persistence. Reassignment/status updates cannot invalidate ownership.
        const response = await send(context, actor);
        const sentAt = new Date();
        const message = await transaction.message.create({
          data: {
            conversationId: input.conversationId,
            metaMessageId: response.messageId,
            direction: MessageDirection.OUTBOUND,
            senderType: MessageSenderType.AGENT,
            senderId: input.senderId,
            messageType: MessageType.TEXT,
            content: input.content,
            sentAt,
          },
        });
        await transaction.conversation.update({
          where: { id: input.conversationId },
          data: {
            lastMessageAt:
              conversation.lastMessageAt && conversation.lastMessageAt > sentAt
                ? conversation.lastMessageAt
                : sentAt,
            firstResponseAt: conversation.firstResponseAt ?? sentAt,
            status:
              conversation.status === ConversationStatus.ASSIGNED ||
              conversation.status === ConversationStatus.WAITING_CUSTOMER
                ? ConversationStatus.IN_PROGRESS
                : conversation.status,
          },
        });
        return {
          message,
          context,
          statusChanged:
            conversation.status === 'ASSIGNED' ||
            conversation.status === 'WAITING_CUSTOMER',
        };
      },
      { timeout: 20_000 },
    );
  }

  async listMessages(input: {
    conversationId: string;
    before?: string;
    limit: number;
  }) {
    let before: { sentAt: Date; id: string } | undefined;
    if (input.before) {
      const cursor = await this.prisma.message.findUnique({
        where: { id: input.before },
        select: { id: true, sentAt: true, conversationId: true },
      });
      if (!cursor || cursor.conversationId !== input.conversationId) {
        throw new ApplicationException(
          'INVALID_MESSAGE_CURSOR',
          'The message cursor is invalid for this conversation.',
          HttpStatus.BAD_REQUEST,
        );
      }
      before = cursor;
    }

    const where = {
      conversationId: input.conversationId,
      ...(before
        ? {
            OR: [
              { sentAt: { lt: before.sentAt } },
              { sentAt: before.sentAt, id: { lt: before.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.message.findMany({
      where,
      take: input.limit + 1,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        conversationId: true,
        direction: true,
        senderType: true,
        senderId: true,
        messageType: true,
        content: true,
        metadata: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
