import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { META_INCOMING_QUEUE } from '../../application/meta-webhook-queue';
import { IncomingMessageProcessor } from '../../application/incoming-message.processor';
import { NormalizedIncomingMessage } from '../../application/incoming-message-repository.port';
import { META_INCOMING_MESSAGE_JOB } from '../../application/meta-webhook-queue';

@Processor(META_INCOMING_QUEUE)
export class MetaIncomingMessageWorker extends WorkerHost {
  constructor(private readonly processor: IncomingMessageProcessor) {
    super();
  }

  async process(job: Job<NormalizedIncomingMessage>): Promise<void> {
    if (job.name !== META_INCOMING_MESSAGE_JOB) return;
    await this.processor.process(job.data);
  }
}
