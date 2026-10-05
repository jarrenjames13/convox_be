import { Module } from '@nestjs/common';
import { REALTIME_PUBLISHER } from '../../core/realtime/realtime-publisher.port';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [
    RealtimeGateway,
    { provide: REALTIME_PUBLISHER, useExisting: RealtimeGateway },
  ],
  exports: [RealtimeGateway, REALTIME_PUBLISHER],
})
export class RealtimeModule {}
