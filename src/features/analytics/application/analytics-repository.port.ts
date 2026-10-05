export const ANALYTICS_REPOSITORY = Symbol('ANALYTICS_REPOSITORY');
export interface AnalyticsOverview {
  totalConversations: number;
  openConversations: number;
  unassignedConversations: number;
  resolvedConversations: number;
  incomingMessageCount: number;
  outgoingMessageCount: number;
  manualReassignmentCount: number;
  averageFirstResponseSeconds: number | null;
  averageResolutionSeconds: number | null;
  volumeByPage: Array<{ pageId: string; name: string; conversations: number }>;
}
export interface AgentAnalytics {
  agentId: string;
  fullName: string;
  totalConversations: number;
  activeConversations: number;
  averageFirstResponseSeconds: number | null;
  averageResolutionSeconds: number | null;
}
export interface AnalyticsRepository {
  overview(): Promise<AnalyticsOverview>;
  agents(): Promise<AgentAnalytics[]>;
}
