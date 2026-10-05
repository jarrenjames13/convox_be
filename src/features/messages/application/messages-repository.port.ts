import type { Message } from '@prisma/client';
import type { AuthenticatedUser } from '../../../core/security/current-user.decorator';
import type { SendTextMessageResult } from './messenger-client.port';

export const MESSAGES_REPOSITORY = Symbol('MESSAGES_REPOSITORY');

export interface ReplyContext {
  id: string;
  status: string;
  assignedAgentId: string | null;
  page: { id: string; metaPageId: string; isActive: boolean };
  contact: { metaPsid: string };
  latestInboundAt: Date | null;
}

export interface MessagesRepository {
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
  ): Promise<{
    message: Message;
    context: ReplyContext;
    statusChanged: boolean;
  }>;
  listMessages(input: {
    conversationId: string;
    before?: string;
    limit: number;
  }): Promise<{ items: unknown[]; nextCursor: string | null }>;
}
