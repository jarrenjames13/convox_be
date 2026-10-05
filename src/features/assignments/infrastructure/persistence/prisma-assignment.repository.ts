import { Injectable } from '@nestjs/common';
import { AssignmentType, ConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  AssignmentRepository,
  AssignmentResult,
} from '../../application/assignment-repository.port';
import { selectRoundRobinAgent } from '../../domain/round-robin.strategy';

const activeStatuses: ConversationStatus[] = [
  ConversationStatus.UNASSIGNED,
  ConversationStatus.ASSIGNED,
  ConversationStatus.IN_PROGRESS,
  ConversationStatus.WAITING_CUSTOMER,
];

@Injectable()
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  assignRoundRobin(conversationId: string): Promise<AssignmentResult> {
    return this.prisma.$transaction((transaction) =>
      this.assignRoundRobinInTransaction(transaction, conversationId),
    );
  }

  async assignRoundRobinInTransaction(
    transaction: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<AssignmentResult> {
    const target = await transaction.conversation.findUnique({
      where: { id: conversationId },
      select: { pageId: true },
    });
    if (!target) return { status: 'conversation_missing', conversationId };
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE
    `;
    if (!locked.length)
      return { status: 'conversation_missing', conversationId };

    const conversation = await transaction.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { id: true, pageId: true, assignedAgentId: true, status: true },
    });
    if (conversation.assignedAgentId) {
      return {
        status: 'unchanged',
        conversationId,
        pageId: conversation.pageId,
        toAgentId: conversation.assignedAgentId,
      };
    }
    if (conversation.status !== ConversationStatus.UNASSIGNED) {
      return {
        status: 'inactive_conversation',
        conversationId,
        pageId: conversation.pageId,
      };
    }

    await transaction.routingState.upsert({
      where: { pageId: conversation.pageId },
      create: { pageId: conversation.pageId },
      update: {},
    });
    await transaction.$queryRaw<Array<{ page_id: string }>>`
      SELECT page_id FROM routing_state WHERE page_id = ${conversation.pageId}::uuid FOR UPDATE
    `;
    const routingState = await transaction.routingState.findUniqueOrThrow({
      where: { pageId: conversation.pageId },
      select: { lastAssignedAgentId: true },
    });

    await transaction.$queryRaw`
      SELECT agent_id FROM page_agents
      WHERE page_id = ${conversation.pageId}::uuid
      ORDER BY agent_id FOR UPDATE
    `;

    // Cross-Page assignments serialize on shared agent profiles too. This
    // protects the agent-wide fallback capacity while keeping cursors Page-scoped.
    await transaction.$queryRaw`
      SELECT ap.user_id FROM agent_profiles ap
      JOIN page_agents pa ON pa.agent_id = ap.user_id
      WHERE pa.page_id = ${conversation.pageId}::uuid
      ORDER BY ap.user_id FOR UPDATE OF ap
    `;

    const [memberships, workloads, pageWorkloads] = await Promise.all([
      transaction.pageAgent.findMany({
        where: { pageId: conversation.pageId },
        include: {
          agent: {
            include: {
              user: { select: { id: true, role: true, isActive: true } },
            },
          },
        },
      }),
      transaction.conversation.groupBy({
        by: ['assignedAgentId'],
        where: {
          assignedAgentId: { not: null },
          status: { in: activeStatuses },
        },
        _count: { _all: true },
      }),
      transaction.conversation.groupBy({
        by: ['assignedAgentId'],
        where: {
          pageId: conversation.pageId,
          assignedAgentId: { not: null },
          status: { in: activeStatuses },
        },
        _count: { _all: true },
      }),
    ]);
    const workloadByAgent = new Map(
      workloads.map((row) => [row.assignedAgentId, row._count._all]),
    );
    const pageWorkloadByAgent = new Map(
      pageWorkloads.map((row) => [row.assignedAgentId, row._count._all]),
    );
    const candidates = memberships.map((membership) => ({
      agentId: membership.agent.user.id,
      isActive: membership.agent.user.isActive,
      isAgent: membership.agent.user.role === 'AGENT',
      isPageMember: true,
      membershipEnabled: membership.isEnabled,
      acceptingConversations: membership.agent.acceptingConversations,
      activeWorkload:
        (membership.maxActiveConversations === null
          ? workloadByAgent
          : pageWorkloadByAgent
        ).get(membership.agent.user.id) ?? 0,
      maxActiveConversations:
        membership.maxActiveConversations ??
        membership.agent.maxActiveConversations,
    }));
    const selected = selectRoundRobinAgent(
      candidates,
      routingState.lastAssignedAgentId,
    );
    if (!selected)
      return {
        status: 'no_agent',
        conversationId,
        pageId: conversation.pageId,
      };

    const now = new Date();
    await transaction.conversation.update({
      where: { id: conversationId },
      data: {
        assignedAgentId: selected.agentId,
        status: ConversationStatus.ASSIGNED,
        assignedAt: now,
      },
    });
    await transaction.conversationAssignment.create({
      data: {
        conversationId,
        toAgentId: selected.agentId,
        assignmentType: AssignmentType.ROUND_ROBIN,
      },
    });
    await transaction.routingState.update({
      where: { pageId: conversation.pageId },
      data: {
        lastAssignedAgentId: selected.agentId,
        version: { increment: 1 },
      },
    });

    return {
      status: 'assigned',
      conversationId,
      pageId: conversation.pageId,
      fromAgentId: null,
      toAgentId: selected.agentId,
      assignmentType: AssignmentType.ROUND_ROBIN,
    };
  }

  manualAssign(input: {
    conversationId: string;
    agentId: string;
    actorUserId: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AssignmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.conversation.findUnique({
        where: { id: input.conversationId },
        select: { pageId: true },
      });
      if (!target)
        return {
          status: 'conversation_missing',
          conversationId: input.conversationId,
        };
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE
      `;
      if (!locked.length) {
        return {
          status: 'conversation_missing',
          conversationId: input.conversationId,
        };
      }

      const conversation = await transaction.conversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        select: { id: true, pageId: true, assignedAgentId: true, status: true },
      });
      if (!activeStatuses.includes(conversation.status)) {
        return {
          status: 'inactive_conversation',
          conversationId: input.conversationId,
          pageId: conversation.pageId,
        };
      }
      await transaction.$queryRaw<Array<{ agent_id: string }>>`
        SELECT agent_id FROM page_agents
        WHERE page_id = ${conversation.pageId}::uuid AND agent_id = ${input.agentId}::uuid
        FOR UPDATE
      `;
      const membership = await transaction.pageAgent.findUnique({
        where: {
          pageId_agentId: {
            pageId: conversation.pageId,
            agentId: input.agentId,
          },
        },
        include: {
          agent: {
            include: { user: { select: { isActive: true, role: true } } },
          },
        },
      });
      if (
        !membership?.isEnabled ||
        !membership.agent.user.isActive ||
        membership.agent.user.role !== 'AGENT'
      ) {
        return {
          status: 'invalid_agent',
          conversationId: input.conversationId,
          pageId: conversation.pageId,
        };
      }
      if (conversation.assignedAgentId === input.agentId) {
        return {
          status: 'unchanged',
          conversationId: input.conversationId,
          pageId: conversation.pageId,
          fromAgentId: input.agentId,
          toAgentId: input.agentId,
        };
      }

      const now = new Date();
      await transaction.conversation.update({
        where: { id: input.conversationId },
        data: {
          assignedAgentId: input.agentId,
          status:
            conversation.status === ConversationStatus.UNASSIGNED
              ? ConversationStatus.ASSIGNED
              : conversation.status,
          assignedAt: now,
        },
      });
      await transaction.conversationAssignment.create({
        data: {
          conversationId: input.conversationId,
          fromAgentId: conversation.assignedAgentId,
          toAgentId: input.agentId,
          assignmentType: AssignmentType.MANUAL,
          assignedByUserId: input.actorUserId,
          reason: input.reason,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'conversation.manually_assigned',
          resourceType: 'conversation',
          resourceId: input.conversationId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: {
            fromAgentId: conversation.assignedAgentId,
            toAgentId: input.agentId,
            reason: input.reason,
          } satisfies Prisma.InputJsonValue,
        },
      });
      return {
        status: 'assigned',
        conversationId: input.conversationId,
        pageId: conversation.pageId,
        fromAgentId: conversation.assignedAgentId,
        toAgentId: input.agentId,
        assignmentType: AssignmentType.MANUAL,
      };
    });
  }
}
