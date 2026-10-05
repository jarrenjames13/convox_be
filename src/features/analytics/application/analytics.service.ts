import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from './analytics-repository.port';
import type { AnalyticsRepository } from './analytics-repository.port';
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repository: AnalyticsRepository,
  ) {}
  overview() {
    return this.repository.overview();
  }
  agents() {
    return this.repository.agents();
  }
}
