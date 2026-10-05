import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { ApplicationException } from '../../../core/common/application.exception';
import { REALTIME_PUBLISHER } from '../../../core/realtime/realtime-publisher.port';
import type { RealtimePublisher } from '../../../core/realtime/realtime-publisher.port';
import type { AuthenticatedUser } from '../../../core/security/current-user.decorator';
import { AssignmentsService } from '../../assignments/application/assignments.service';
import { MessagesService } from '../../messages/application/messages.service';
import { CONVERSATIONS_REPOSITORY } from './conversations-repository.port';
import type {
  ConversationFilters,
  ConversationView,
  ConversationsRepository,
} from './conversations-repository.port';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly repository: ConversationsRepository,
    private readonly messages: MessagesService,
    private readonly assignments: AssignmentsService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  list(user: AuthenticatedUser, filters: ConversationFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const search = filters.search?.trim().slice(0, 200);
    return this.repository.list(user, { ...filters, page, limit, search });
  }

  async get(
    conversationId: string,
    user: AuthenticatedUser,
  ): Promise<ConversationView> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new ApplicationException(
        'CONVERSATION_NOT_FOUND',
        'Conversation not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertCanView(conversation, user);
    return conversation;
  }

  async getMessages(
    conversationId: string,
    user: AuthenticatedUser,
    before?: string,
    limit = 50,
  ) {
    await this.get(conversationId, user);
    return this.messages.list(
      conversationId,
      before,
      Math.min(100, Math.max(1, limit)),
    );
  }

  async sendText(
    conversationId: string,
    text: string,
    user: AuthenticatedUser,
  ) {
    await this.get(conversationId, user);
    return this.messages.sendText({ conversationId, text, user });
  }

  async assign(input: {
    conversationId: string;
    agentId: string;
    reason?: string;
    actor: AuthenticatedUser;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const result = await this.assignments.manuallyAssign({
      conversationId: input.conversationId,
      agentId: input.agentId,
      actorUserId: input.actor.id,
      reason: input.reason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (result.status === 'assigned' && result.pageId) {
      const event = {
        conversationId: result.conversationId,
        pageId: result.pageId,
        assignedAgentId: result.toAgentId,
        previousAgentId: result.fromAgentId,
        actorUserId: input.actor.id,
      };
      if (result.fromAgentId)
        await this.realtime.publishConversationReassigned(event);
      else await this.realtime.publishConversationAssigned(event);
    }
    return result;
  }

  async changeStatus(input: {
    conversationId: string;
    status: ConversationStatus;
    actor: AuthenticatedUser;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const result = await this.repository.changeStatus({
      conversationId: input.conversationId,
      status: input.status,
      actor: input.actor,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    switch (result.status) {
      case 'missing':
        throw new ApplicationException(
          'CONVERSATION_NOT_FOUND',
          'Conversation not found.',
          HttpStatus.NOT_FOUND,
        );
      case 'not_assigned':
        throw new ApplicationException(
          'CONVERSATION_NOT_ASSIGNED',
          'This conversation is assigned to another agent.',
          HttpStatus.FORBIDDEN,
        );
      case 'invalid_transition':
        throw new ApplicationException(
          'INVALID_CONVERSATION_STATUS_TRANSITION',
          'The requested conversation status transition is not allowed.',
          HttpStatus.CONFLICT,
        );
      case 'updated':
        break;
    }
    await this.realtime.publishConversationStatusChanged({
      conversationId: result.conversation.id,
      pageId: result.conversation.pageId,
      assignedAgentId: result.conversation.assignedAgentId,
      actorUserId: input.actor.id,
      status: result.conversation.status,
    });
    return result.conversation;
  }

  private assertCanView(
    conversation: ConversationView,
    user: AuthenticatedUser,
  ): void {
    if (user.role === 'AGENT' && conversation.assignedAgentId !== user.id) {
      throw new ApplicationException(
        'CONVERSATION_NOT_ASSIGNED',
        'This conversation is assigned to another agent.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
