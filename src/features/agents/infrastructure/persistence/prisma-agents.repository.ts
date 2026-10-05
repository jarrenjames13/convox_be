import { Injectable } from '@nestjs/common';
import { PresenceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import type { AgentView } from '../../application/agents-repository.port';
import {
  AgentRepository,
  CreateAgentInput,
  UpdateAgentInput,
} from '../../application/agents-repository.port';

const safeAgentSelection = {
  userId: true,
  presenceStatus: true,
  acceptingConversations: true,
  maxActiveConversations: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  },
} satisfies Prisma.AgentProfileSelect;

@Injectable()
export class PrismaAgentsRepository implements AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<AgentView[]> {
    return this.prisma.agentProfile.findMany({
      select: safeAgentSelection,
      orderBy: { user: { fullName: 'asc' } },
    });
  }

  findById(id: string): Promise<AgentView | null> {
    return this.prisma.agentProfile.findUnique({
      where: { userId: id },
      select: safeAgentSelection,
    });
  }

  create(input: CreateAgentInput): Promise<AgentView> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          fullName: input.fullName,
          role: 'AGENT',
          agentProfile: {
            create: { maxActiveConversations: input.maxActiveConversations },
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'agent.created',
          resourceType: 'agent',
          resourceId: user.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { email: user.email } satisfies Prisma.InputJsonValue,
        },
      });
      return transaction.agentProfile.findUniqueOrThrow({
        where: { userId: user.id },
        select: safeAgentSelection,
      });
    });
  }

  update(input: UpdateAgentInput): Promise<AgentView | null> {
    return this.prisma.$transaction(async (transaction) => {
      const profile = await transaction.agentProfile.findUnique({
        where: { userId: input.id },
      });
      if (!profile) return null;
      await transaction.user.update({
        where: { id: input.id },
        data: input.fullName ? { fullName: input.fullName } : {},
      });
      if (input.maxActiveConversations !== undefined) {
        await transaction.agentProfile.update({
          where: { userId: input.id },
          data: { maxActiveConversations: input.maxActiveConversations },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'agent.updated',
          resourceType: 'agent',
          resourceId: input.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
      return transaction.agentProfile.findUniqueOrThrow({
        where: { userId: input.id },
        select: safeAgentSelection,
      });
    });
  }

  setActive(input: {
    id: string;
    isActive: boolean;
    actorUserId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AgentView | null> {
    return this.prisma.$transaction(async (transaction) => {
      const profile = await transaction.agentProfile.findUnique({
        where: { userId: input.id },
      });
      if (!profile) return null;
      await transaction.user.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      if (!input.isActive) {
        await transaction.refreshToken.updateMany({
          where: { userId: input.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.agentProfile.update({
          where: { userId: input.id },
          data: {
            presenceStatus: PresenceStatus.OFFLINE,
            acceptingConversations: false,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.isActive ? 'agent.enabled' : 'agent.disabled',
          resourceType: 'agent',
          resourceId: input.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
      return transaction.agentProfile.findUniqueOrThrow({
        where: { userId: input.id },
        select: safeAgentSelection,
      });
    });
  }

  setPresence(input: {
    id: string;
    presenceStatus: PresenceStatus;
    acceptingConversations: boolean;
  }): Promise<AgentView | null> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: input.id },
        select: { isActive: true, role: true },
      });
      if (!user || user.role !== 'AGENT' || !user.isActive) return null;
      await transaction.agentProfile.update({
        where: { userId: input.id },
        data: {
          presenceStatus: input.presenceStatus,
          acceptingConversations: input.acceptingConversations,
          lastSeenAt: new Date(),
        },
      });
      return transaction.agentProfile.findUniqueOrThrow({
        where: { userId: input.id },
        select: safeAgentSelection,
      });
    });
  }
}
