import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MetaWebhookService } from '../../application/meta-webhook.service';

@ApiTags('webhooks')
@Controller('v1/webhooks/meta')
export class MetaWebhookController {
  constructor(private readonly webhooks: MetaWebhookService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Verify Meta webhook subscription' })
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.webhooks.verifySubscription(mode, token, challenge);
  }

  @Post()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify signature and enqueue Meta Page events' })
  async receive(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
  ) {
    this.webhooks.verifySignature(signature, request.rawBody);
    return this.webhooks.enqueue(body);
  }
}
