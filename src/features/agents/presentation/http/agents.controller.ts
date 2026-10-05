import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { AgentsService } from '../../application/agents.service';
import {
  CreateAgentDto,
  SetAgentStatusDto,
  SetPresenceDto,
  UpdateAgentDto,
} from './dto/agents.dto';

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.AgentsRead)
  @ApiOperation({ summary: 'List agents' })
  list() {
    return this.agents.list();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.AgentsManage)
  @ApiOperation({ summary: 'Create an agent account' })
  create(
    @Body() dto: CreateAgentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.agents.create({
      ...dto,
      actorUserId: actor.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Patch('me/presence')
  @ApiOperation({
    summary: 'Update the current agent presence and availability',
  })
  setMyPresence(
    @Body() dto: SetPresenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agents.setPresence({ id: user.id, ...dto });
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.AgentsRead)
  get(@Param('id') id: string) {
    return this.agents.get(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.AgentsManage)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.agents.update({
      ...dto,
      id,
      actorUserId: actor.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.AgentsManage)
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetAgentStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.agents.setActive({
      ...dto,
      id,
      actorUserId: actor.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
