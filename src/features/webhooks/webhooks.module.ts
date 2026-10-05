import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { QueueModule } from '../../core/queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { INCOMING_MESSAGE_REPOSITORY } from './application/incoming-message-repository.port';
import { IncomingMessageProcessor } from './application/incoming-message.processor';
import { META_INCOMING_QUEUE } from './application/meta-webhook-queue';
import { MetaWebhookService } from './application/meta-webhook.service';
import { PrismaIncomingMessageRepository } from './infrastructure/persistence/prisma-incoming-message.repository';
import { MetaIncomingMessageWorker } from './infrastructure/queue/meta-incoming-message.worker';
import { MetaWebhookController } from './presentation/http/meta-webhook.controller';

@Module({
  imports: [
    QueueModule,
    RealtimeModule,
    AssignmentsModule,
    BullModule.registerQueue({ name: META_INCOMING_QUEUE }),
  ],
  controllers: [MetaWebhookController],
  providers: [
    MetaWebhookService,
    IncomingMessageProcessor,
    PrismaIncomingMessageRepository,
    MetaIncomingMessageWorker,
    {
      provide: INCOMING_MESSAGE_REPOSITORY,
      useExisting: PrismaIncomingMessageRepository,
    },
  ],
})
export class WebhooksModule {}
