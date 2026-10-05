import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnvironment } from './core/config/configuration';
import { PrismaModule } from './core/database/prisma.module';
import { QueueModule } from './core/queue/queue.module';
import { RedisModule } from './core/redis/redis.module';
import { SecurityModule } from './core/security/security.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './features/auth/auth.module';
import { AuditModule } from './features/audit/audit.module';
import { AgentsModule } from './features/agents/agents.module';
import { FacebookPagesModule } from './features/facebook-pages/facebook-pages.module';
import { AssignmentsModule } from './features/assignments/assignments.module';
import { RealtimeModule } from './features/realtime/realtime.module';
import { MessagesModule } from './features/messages/messages.module';
import { ConversationsModule } from './features/conversations/conversations.module';
import { WebhooksModule } from './features/webhooks/webhooks.module';
import { UsersModule } from './features/users/users.module';
import { AnalyticsModule } from './features/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    QueueModule,
    SecurityModule,
    AuditModule,
    AuthModule,
    AgentsModule,
    FacebookPagesModule,
    AssignmentsModule,
    RealtimeModule,
    MessagesModule,
    ConversationsModule,
    WebhooksModule,
    UsersModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
