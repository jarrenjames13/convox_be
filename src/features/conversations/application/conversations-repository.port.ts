import { ConversationStatus, UserRole } from '@prisma/client';

export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');

export interface ConversationActor {
  id: string;
  role: UserRole;
}

export interface ConversationFilters {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
  assignedAgentId?: string;
  pageId?: string;
  search?: string;
}

export interface ConversationView {
  id: string;
  pageId: string;
  contactId: string;
  assignedAgentId: string | null;
  status: ConversationStatus;
  assignedAt: Date | null;
  openedAt: Date;
  firstResponseAt: Date | null;
  lastMessageAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact: {
    id: string;
    displayName: string | null;
    profilePictureUrl: string | null;
  };
  page: { id: string; name: string };
  assignedAgent: { id: string; fullName: string; role: UserRole } | null;
  messages?: Array<{
    id: string;
    direction: string;
    messageType: string;
    content: string | null;
    sentAt: Date;
  }>;
  assignments?: unknown[];
}

export type StatusChangeResult =
  | { status: 'updated'; conversation: ConversationView }
  | { status: 'missing' | 'not_assigned' | 'invalid_transition' };

export interface ConversationsRepository {
  list(
    actor: ConversationActor,
    filters: ConversationFilters,
  ): Promise<{
    items: ConversationView[];
    total: number;
    page: number;
    limit: number;
  }>;
  findById(id: string): Promise<ConversationView | null>;
  changeStatus(input: {
    conversationId: string;
    status: ConversationStatus;
    actor: ConversationActor;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<StatusChangeResult>;
}
