import { Module } from '@nestjs/common';
import { AGENTS_REPOSITORY } from './application/agents-repository.port';
import { AgentsService } from './application/agents.service';
import { PrismaAgentsRepository } from './infrastructure/persistence/prisma-agents.repository';
import { AgentsController } from './presentation/http/agents.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    PrismaAgentsRepository,
    { provide: AGENTS_REPOSITORY, useExisting: PrismaAgentsRepository },
  ],
  exports: [AgentsService],
})
export class AgentsModule {}
