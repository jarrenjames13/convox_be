import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { ApplicationException } from '../../../core/common/application.exception';
import { REALTIME_PUBLISHER } from '../../../core/realtime/realtime-publisher.port';
import type { RealtimePublisher } from '../../../core/realtime/realtime-publisher.port';
import type { AuthenticatedUser } from '../../../core/security/current-user.decorator';
import { MESSAGES_REPOSITORY } from './messages-repository.port';
import type { MessagesRepository } from './messages-repository.port';
import { MESSENGER_CLIENT } from './messenger-client.port';
import type { MessengerClient } from './messenger-client.port';
import {
  Permission,
  ROLE_PERMISSIONS,
} from '../../../core/security/permissions';

const activeStatuses = new Set<ConversationStatus>([
  ConversationStatus.UNASSIGNED,
  ConversationStatus.ASSIGNED,
  ConversationStatus.IN_PROGRESS,
  ConversationStatus.WAITING_CUSTOMER,
]);

@Injectable()
export class MessagesService {
  private readonly messagingWindowMs = 24 * 60 * 60 * 1000;

  constructor(
    @Inject(MESSAGES_REPOSITORY)
    private readonly repository: MessagesRepository,
    @Inject(MESSENGER_CLIENT) private readonly messenger: MessengerClient,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async list(
    conversationId: string,
    before: string | undefined,
    limit: number,
  ) {
    return this.repository.listMessages({ conversationId, before, limit });
  }

  async sendText(input: {
    conversationId: string;
    text: string;
    user: AuthenticatedUser;
  }) {
    const { message, context, statusChanged } = await this.repository.sendReply(
      {
        conversationId: input.conversationId,
        senderId: input.user.id,
        content: input.text,
      },
      async (context, actor) => {
        if (
          !ROLE_PERMISSIONS[actor.role].has(Permission.ConversationsViewAll) &&
          context.assignedAgentId !== actor.id
        ) {
          throw new ApplicationException(
            'CONVERSATION_NOT_ASSIGNED',
            'This conversation is assigned to another agent.',
            HttpStatus.FORBIDDEN,
          );
        }
        if (!activeStatuses.has(context.status as ConversationStatus)) {
          throw new ApplicationException(
            'CONVERSATION_ALREADY_RESOLVED',
            'This conversation is no longer active.',
            HttpStatus.CONFLICT,
          );
        }
        if (!context.page.isActive) {
          throw new ApplicationException(
            'FACEBOOK_PAGE_NOT_CONFIGURED',
            'The Facebook Page is inactive.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        if (
          !context.latestInboundAt ||
          Date.now() - context.latestInboundAt.getTime() >
            this.messagingWindowMs
        ) {
          throw new ApplicationException(
            'MESSAGING_WINDOW_EXPIRED',
            'The Messenger reply window has expired.',
            HttpStatus.CONFLICT,
          );
        }

        const response = await this.messenger.sendTextMessage({
          metaPageId: context.page.metaPageId,
          recipientPsid: context.contact.metaPsid,
          text: input.text,
        });
        return response;
      },
    );
    const event = {
      conversationId: context.id,
      pageId: context.page.id,
      assignedAgentId: context.assignedAgentId,
      actorUserId: input.user.id,
      message: {
        id: message.id,
        direction: 'OUTBOUND' as const,
        senderType: 'AGENT' as const,
        content: message.content,
        messageType: message.messageType,
        sentAt: message.sentAt,
      },
    };
    await this.realtime.publishMessageSent(event);
    if (statusChanged)
      await this.realtime.publishConversationStatusChanged({
        conversationId: context.id,
        pageId: context.page.id,
        assignedAgentId: context.assignedAgentId,
        status: 'IN_PROGRESS',
      });
    return { message };
  }
}
