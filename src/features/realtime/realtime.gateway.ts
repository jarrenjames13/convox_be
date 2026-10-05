import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user.decorator';
import { Permission, ROLE_PERMISSIONS } from '../../core/security/permissions';
import type {
  ConversationRealtimeEvent,
  MessageRealtimeEvent,
  RealtimePublisher,
  AgentPresenceRealtimeEvent,
} from '../../core/realtime/realtime-publisher.port';

type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { user?: AuthenticatedUser; expiresAt?: number };
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
        .split(',')
        .map((value) => value.trim());
      callback(null, !origin || allowed.includes(origin));
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, RealtimePublisher {
  @WebSocketServer()
  private server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket as AuthenticatedSocket).then(
        () => next(),
        () => next(new Error('UNAUTHORIZED')),
      );
    });
  }

  private async authenticate(socket: AuthenticatedSocket): Promise<void> {
    const auth: unknown = socket.handshake.auth;
    const authToken =
      typeof auth === 'object' && auth !== null && 'token' in auth
        ? auth.token
        : undefined;
    const token =
      typeof authToken === 'string'
        ? authToken
        : socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('UNAUTHORIZED');
    const payload = await this.jwt.verifyAsync<{ sub?: string; exp?: number }>(
      token,
    );
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number')
      throw new Error('UNAUTHORIZED');
    const user = await this.loadUser(payload.sub);
    if (!user?.isActive) throw new Error('UNAUTHORIZED');
    socket.data.user = user;
    socket.data.expiresAt = payload.exp * 1000;
    await socket.join(`user:${user.id}`);
    if (user.role === 'AGENT') await socket.join(`agent:${user.id}`);
    if (ROLE_PERMISSIONS[user.role].has(Permission.ConversationsViewAll))
      await socket.join(`role:${user.role.toLowerCase()}`);
  }

  private loadUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
  }

  private async currentUser(
    socket: AuthenticatedSocket,
  ): Promise<AuthenticatedUser | null> {
    if (
      !socket.data.user ||
      !socket.data.expiresAt ||
      socket.data.expiresAt <= Date.now()
    ) {
      socket.disconnect(true);
      return null;
    }
    const user = await this.loadUser(socket.data.user.id);
    if (!user?.isActive) {
      socket.disconnect(true);
      return null;
    }
    return user;
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = await this.currentUser(socket);
    const conversationId = body?.conversationId;
    if (!user || typeof conversationId !== 'string' || !isUuid(conversationId))
      return { error: { code: 'FORBIDDEN' } };
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { assignedAgentId: true },
    });
    if (
      !conversation ||
      (!ROLE_PERMISSIONS[user.role].has(Permission.ConversationsViewAll) &&
        conversation.assignedAgentId !== user.id)
    ) {
      return { error: { code: 'FORBIDDEN' } };
    }
    await socket.join(`conversation:${conversationId}`);
    return { conversationId, joined: true };
  }

  @SubscribeMessage('conversation.leave')
  async leaveConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    if (typeof body?.conversationId === 'string' && isUuid(body.conversationId))
      await socket.leave(`conversation:${body.conversationId}`);
    return { left: true };
  }

  publishConversationCreated(event: ConversationRealtimeEvent): Promise<void> {
    return this.publishConversation('conversation.created', event);
  }
  publishConversationAssigned(event: ConversationRealtimeEvent): Promise<void> {
    return this.publishConversation('conversation.assigned', event);
  }
  async publishConversationReassigned(
    event: ConversationRealtimeEvent,
  ): Promise<void> {
    if (event.previousAgentId)
      this.server
        ?.in(`user:${event.previousAgentId}`)
        .socketsLeave(`conversation:${event.conversationId}`);
    await this.publishConversation('conversation.reassigned', event, true);
  }
  publishConversationStatusChanged(
    event: ConversationRealtimeEvent,
  ): Promise<void> {
    return this.publishConversation('conversation.status_changed', event);
  }
  publishMessageReceived(event: MessageRealtimeEvent): Promise<void> {
    return this.publishConversation('message.received', event);
  }
  publishMessageSent(event: MessageRealtimeEvent): Promise<void> {
    return this.publishConversation('message.sent', event);
  }

  async publishAgentPresenceChanged(
    event: AgentPresenceRealtimeEvent,
  ): Promise<void> {
    if (!this.server) return;
    for (const socket of this.server.sockets.values()) {
      const user = await this.currentUser(socket as AuthenticatedSocket);
      if (
        user &&
        (user.id === event.agentId ||
          ROLE_PERMISSIONS[user.role].has(Permission.AgentsManage))
      )
        socket.emit('agent.presence_changed', {
          event: 'agent.presence_changed',
          ...event,
        });
    }
  }

  private async publishConversation(
    name: string,
    event: ConversationRealtimeEvent,
    notifyPrevious = false,
  ): Promise<void> {
    if (!this.server) return;
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: event.conversationId },
      select: { assignedAgentId: true },
    });
    if (!conversation) return;
    // Recheck live database identity and ownership at delivery time, so stale
    // conversation rooms and disabled accounts never receive customer content.
    for (const socket of this.server.sockets.values()) {
      const user = await this.currentUser(socket as AuthenticatedSocket);
      if (!user) continue;
      const authorized =
        ROLE_PERMISSIONS[user.role].has(Permission.ConversationsViewAll) ||
        conversation.assignedAgentId === user.id ||
        (notifyPrevious && event.previousAgentId === user.id);
      if (authorized) socket.emit(name, { event: name, ...event });
    }
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
