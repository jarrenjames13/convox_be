import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../core/security/jwt-auth.guard';
import {
  Permission,
  RequirePermissions,
} from '../../../../core/security/permissions';
import { PermissionsGuard } from '../../../../core/security/permissions.guard';
import { AnalyticsService } from '../../application/analytics.service';
@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.AnalyticsView)
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('overview') overview() {
    return this.analytics.overview();
  }
  @Get('agents') agents() {
    return this.analytics.agents();
  }
}
