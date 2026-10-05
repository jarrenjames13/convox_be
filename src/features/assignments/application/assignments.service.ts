import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApplicationException } from '../../../core/common/application.exception';
import { ASSIGNMENT_REPOSITORY } from './assignment-repository.port';
import type { AssignmentRepository } from './assignment-repository.port';

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY)
    private readonly repository: AssignmentRepository,
  ) {}

  assignNewConversation(conversationId: string) {
    return this.repository.assignRoundRobin(conversationId);
  }

  async manuallyAssign(
    input: Parameters<AssignmentRepository['manualAssign']>[0],
  ) {
    const result = await this.repository.manualAssign(input);
    if (result.status === 'conversation_missing') {
      throw new ApplicationException(
        'CONVERSATION_NOT_FOUND',
        'Conversation not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (result.status === 'invalid_agent') {
      throw new ApplicationException(
        'AGENT_NOT_ASSIGNED_TO_PAGE',
        'The selected agent is not an active member of this Facebook Page.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (result.status === 'inactive_conversation') {
      throw new ApplicationException(
        'CONVERSATION_ALREADY_RESOLVED',
        'Only active conversations can be assigned.',
        HttpStatus.CONFLICT,
      );
    }
    return result;
  }
}
