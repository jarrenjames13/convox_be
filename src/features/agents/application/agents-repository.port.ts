import type { PresenceStatus, UserRole } from '@prisma/client';

export const AGENTS_REPOSITORY = Symbol('AGENTS_REPOSITORY');

export interface CreateAgentInput {
  email: string;
  fullName: string;
  passwordHash: string;
  maxActiveConversations: number;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateAgentInput {
  id: string;
  fullName?: string;
  maxActiveConversations?: number;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AgentView {
  userId: string;
  presenceStatus: PresenceStatus;
  acceptingConversations: boolean;
  maxActiveConversations: number;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
  };
}

export interface AgentRepository {
  list(): Promise<AgentView[]>;
  findById(id: string): Promise<AgentView | null>;
  create(input: CreateAgentInput): Promise<AgentView>;
  update(input: UpdateAgentInput): Promise<AgentView | null>;
  setActive(input: {
    id: string;
    isActive: boolean;
    actorUserId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AgentView | null>;
  setPresence(input: {
    id: string;
    presenceStatus: PresenceStatus;
    acceptingConversations: boolean;
  }): Promise<AgentView | null>;
}
