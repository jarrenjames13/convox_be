import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../../core/security/current-user.decorator';
import type { AuthenticatedUser } from '../../../../core/security/current-user.decorator';
import { JwtAuthGuard } from '../../../../core/security/jwt-auth.guard';
import {
  Permission,
  RequirePermissions,
} from '../../../../core/security/permissions';
import { PermissionsGuard } from '../../../../core/security/permissions.guard';
import { FacebookPagesService } from '../../application/facebook-pages.service';
import { AssignPageAgentDto } from './dto/page-agent.dto';

@ApiTags('pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.PagesManage)
@Controller('v1/pages')
export class FacebookPagesController {
  constructor(private readonly pages: FacebookPagesService) {}

  @Get()
  @ApiOperation({ summary: 'List configured Facebook Pages' })
  list() {
    return this.pages.list();
  }

  @Get(':pageId/agents')
  @ApiOperation({ summary: 'List agents associated with a Facebook Page' })
  listAgents(@Param('pageId') pageId: string) {
    return this.pages.listAgents(pageId);
  }

  @Post(':pageId/agents')
  @ApiOperation({ summary: 'Associate an agent with a Facebook Page' })
  assignAgent(
    @Param('pageId') pageId: string,
    @Body() dto: AssignPageAgentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.pages.assignAgent({
      ...dto,
      pageId,
      actorUserId: actor.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Delete(':pageId/agents/:agentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an agent from a Facebook Page' })
  removeAgent(
    @Param('pageId') pageId: string,
    @Param('agentId') agentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.pages.removeAgent({
      pageId,
      agentId,
      actorUserId: actor.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
