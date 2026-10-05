import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CONVERSATIONS_REPOSITORY } from './application/conversations-repository.port';
import { ConversationsService } from './application/conversations.service';
import { PrismaConversationsRepository } from './infrastructure/persistence/prisma-conversations.repository';
import { ConversationsController } from './presentation/http/conversations.controller';

@Module({
  imports: [AssignmentsModule, MessagesModule, RealtimeModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    PrismaConversationsRepository,
    {
      provide: CONVERSATIONS_REPOSITORY,
      useExisting: PrismaConversationsRepository,
    },
  ],
})
export class ConversationsModule {}
