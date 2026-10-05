import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
import { MESSAGES_REPOSITORY } from './application/messages-repository.port';
import { MessagesService } from './application/messages.service';
import { MESSENGER_CLIENT } from './application/messenger-client.port';
import { MetaMessengerClient } from './infrastructure/adapters/meta-messenger.client';
import { PrismaMessagesRepository } from './infrastructure/persistence/prisma-messages.repository';

@Module({
  imports: [FacebookPagesModule, RealtimeModule],
  providers: [
    MessagesService,
    PrismaMessagesRepository,
    MetaMessengerClient,
    { provide: MESSAGES_REPOSITORY, useExisting: PrismaMessagesRepository },
    { provide: MESSENGER_CLIENT, useExisting: MetaMessengerClient },
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
