import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApplicationException } from '../core/common/application.exception';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../core/database/prisma.service';
import { RedisService } from '../core/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get(['', 'ready'])
  async ready() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    const ready = database && redis;

    const payload = {
      status: ready ? 'ok' : 'degraded',
      database: database ? 'connected' : 'unreachable',
      redis: redis ? 'connected' : 'unreachable',
    };

    if (!ready)
      throw new ApplicationException(
        'SERVICE_NOT_READY',
        'Required services are unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
        payload,
      );
    return payload;
  }
}
