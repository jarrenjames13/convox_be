import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { ConversationsService } from '../../application/conversations.service';
import {
  AssignConversationDto,
  ChangeConversationStatusDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
} from './dto/conversations.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations visible to the current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversations.list(user, query);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'List conversation messages using cursor pagination',
  })
  messages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.conversations.getMessages(id, user, query.before, query.limit);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a Messenger text reply' })
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversations.sendText(id, dto.text, user);
  }

  @Post(':id/assign')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.ConversationsAssign)
  @ApiOperation({ summary: 'Manually assign or reassign a conversation' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConversationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.conversations.assign({
      conversationId: id,
      agentId: dto.agentId,
      reason: dto.reason,
      actor,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change conversation status' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeConversationStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.conversations.changeStatus({
      conversationId: id,
      status: dto.status,
      actor,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation and its assignment history' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversations.get(id, user);
  }
}
