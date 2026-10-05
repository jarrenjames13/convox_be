import { MessageType } from '@prisma/client';

export const INCOMING_MESSAGE_REPOSITORY = Symbol(
  'INCOMING_MESSAGE_REPOSITORY',
);

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface NormalizedIncomingMessage {
  pageMetaId: string;
  metaMessageId: string;
  senderPsid: string;
  timestamp: string;
  content: string | null;
  messageType: MessageType;
  metadata?: JsonValue;
}

export type IncomingMessageResult =
  | { duplicate: true }
  | {
      duplicate: false;
      conversationId: string;
      pageId: string;
      assignedAgentId: string | null;
      message: {
        id: string;
        direction: 'INBOUND';
        senderType: 'CUSTOMER';
        content: string | null;
        messageType: MessageType;
        sentAt: Date;
      };
      createdConversation: boolean;
      assigned: boolean;
    };

export interface IncomingMessageRepository {
  processMessage(
    message: NormalizedIncomingMessage,
  ): Promise<IncomingMessageResult>;
}
