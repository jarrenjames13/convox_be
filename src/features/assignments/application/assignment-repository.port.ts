import { AssignmentType } from '@prisma/client';

export const ASSIGNMENT_REPOSITORY = Symbol('ASSIGNMENT_REPOSITORY');

export interface AssignmentResult {
  status:
    | 'assigned'
    | 'unchanged'
    | 'no_agent'
    | 'conversation_missing'
    | 'invalid_agent'
    | 'inactive_conversation';
  conversationId: string;
  pageId?: string;
  fromAgentId?: string | null;
  toAgentId?: string | null;
  assignmentType?: AssignmentType;
}

export interface AssignmentRepository {
  assignRoundRobin(conversationId: string): Promise<AssignmentResult>;
  manualAssign(input: {
    conversationId: string;
    agentId: string;
    actorUserId: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AssignmentResult>;
}
