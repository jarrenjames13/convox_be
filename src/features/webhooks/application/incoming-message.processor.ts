import { Inject, Injectable } from '@nestjs/common';
import { REALTIME_PUBLISHER } from '../../../core/realtime/realtime-publisher.port';
import type { RealtimePublisher } from '../../../core/realtime/realtime-publisher.port';
import { INCOMING_MESSAGE_REPOSITORY } from './incoming-message-repository.port';
import type {
  IncomingMessageRepository,
  NormalizedIncomingMessage,
} from './incoming-message-repository.port';

@Injectable()
export class IncomingMessageProcessor {
  constructor(
    @Inject(INCOMING_MESSAGE_REPOSITORY)
    private readonly repository: IncomingMessageRepository,
    @Inject(REALTIME_PUBLISHER)
    private readonly realtime: RealtimePublisher,
  ) {}

  async process(message: NormalizedIncomingMessage): Promise<void> {
    const result = await this.repository.processMessage(message);
    if (result.duplicate) return;

    const conversationEvent = {
      conversationId: result.conversationId,
      pageId: result.pageId,
      assignedAgentId: result.assignedAgentId,
    };
    if (result.createdConversation) {
      await this.realtime.publishConversationCreated(conversationEvent);
    }
    if (result.assigned) {
      await this.realtime.publishConversationAssigned(conversationEvent);
    }
    await this.realtime.publishMessageReceived({
      ...conversationEvent,
      message: result.message,
    });
  }
}
