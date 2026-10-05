import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import type {
  AgentAnalytics,
  AnalyticsOverview,
  AnalyticsRepository,
} from '../../application/analytics-repository.port';

@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async overview(): Promise<AnalyticsOverview> {
    const [
      rows,
      incomingMessageCount,
      outgoingMessageCount,
      manualReassignmentCount,
      volumeByPage,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<
          Omit<
            AnalyticsOverview,
            | 'incomingMessageCount'
            | 'outgoingMessageCount'
            | 'manualReassignmentCount'
            | 'volumeByPage'
          >
        >
      >`
        SELECT count(*)::int AS "totalConversations",
          count(*) FILTER (WHERE status IN ('UNASSIGNED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER'))::int AS "openConversations",
          count(*) FILTER (WHERE status = 'UNASSIGNED')::int AS "unassignedConversations",
          count(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolvedConversations",
          avg(EXTRACT(EPOCH FROM first_response_at - opened_at))::float8 AS "averageFirstResponseSeconds",
          avg(EXTRACT(EPOCH FROM resolved_at - opened_at))::float8 AS "averageResolutionSeconds"
        FROM conversations
      `,
      this.prisma.message.count({ where: { direction: 'INBOUND' } }),
      this.prisma.message.count({ where: { direction: 'OUTBOUND' } }),
      this.prisma.conversationAssignment.count({
        where: { assignmentType: 'MANUAL', fromAgentId: { not: null } },
      }),
      this.prisma.$queryRaw<AnalyticsOverview['volumeByPage']>`
        SELECT p.id AS "pageId", p.name, count(c.id)::int AS conversations FROM facebook_pages p
        LEFT JOIN conversations c ON c.page_id = p.id GROUP BY p.id, p.name ORDER BY p.name
      `,
    ]);
    return {
      ...rows[0],
      incomingMessageCount,
      outgoingMessageCount,
      manualReassignmentCount,
      volumeByPage,
    };
  }
  agents(): Promise<AgentAnalytics[]> {
    return this.prisma.$queryRaw<AgentAnalytics[]>`
      SELECT u.id AS "agentId", u.full_name AS "fullName", count(c.id)::int AS "totalConversations",
        count(c.id) FILTER (WHERE c.status IN ('UNASSIGNED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER'))::int AS "activeConversations",
        avg(EXTRACT(EPOCH FROM c.first_response_at - c.opened_at))::float8 AS "averageFirstResponseSeconds",
        avg(EXTRACT(EPOCH FROM c.resolved_at - c.opened_at))::float8 AS "averageResolutionSeconds"
      FROM users u LEFT JOIN conversations c ON c.assigned_agent_id = u.id
      WHERE u.role = 'AGENT' GROUP BY u.id, u.full_name ORDER BY u.full_name
    `;
  }
}
