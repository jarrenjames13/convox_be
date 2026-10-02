import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const dbConnected = this.dataSource.isInitialized;
    let dbReachable = false;

    if (dbConnected) {
      try {
        await this.dataSource.query('SELECT 1');
        dbReachable = true;
      } catch {
        dbReachable = false;
      }
    }

    return {
      status: dbReachable ? 'ok' : 'degraded',
      database: dbReachable ? 'connected' : 'unreachable',
    };
  }
}
