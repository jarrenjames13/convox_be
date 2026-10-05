import { Module } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from './application/analytics-repository.port';
import { AnalyticsService } from './application/analytics.service';
import { PrismaAnalyticsRepository } from './infrastructure/persistence/prisma-analytics.repository';
import { AnalyticsController } from './presentation/http/analytics.controller';
@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    PrismaAnalyticsRepository,
    { provide: ANALYTICS_REPOSITORY, useExisting: PrismaAnalyticsRepository },
  ],
})
export class AnalyticsModule {}
