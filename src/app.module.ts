import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './core/config/configuration';
import { DatabaseModule } from './core/database/database.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
