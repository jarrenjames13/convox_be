export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

export interface ConversationRealtimeEvent {
  conversationId: string;
  pageId: string;
  assignedAgentId?: string | null;
  previousAgentId?: string | null;
  actorUserId?: string | null;
  status?: string;
}

export interface MessageRealtimeEvent extends ConversationRealtimeEvent {
  message: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    senderType: 'CUSTOMER' | 'AGENT' | 'PAGE';
    content: string | null;
    messageType: string;
    sentAt: Date;
  };
}

export interface AgentPresenceRealtimeEvent {
  agentId: string;
  presenceStatus: string;
  acceptingConversations: boolean;
}

export interface RealtimePublisher {
  publishConversationCreated(event: ConversationRealtimeEvent): Promise<void>;
  publishConversationAssigned(event: ConversationRealtimeEvent): Promise<void>;
  publishConversationReassigned(
    event: ConversationRealtimeEvent,
  ): Promise<void>;
  publishConversationStatusChanged(
    event: ConversationRealtimeEvent,
  ): Promise<void>;
  publishMessageReceived(event: MessageRealtimeEvent): Promise<void>;
  publishMessageSent(event: MessageRealtimeEvent): Promise<void>;
  publishAgentPresenceChanged(event: AgentPresenceRealtimeEvent): Promise<void>;
}
