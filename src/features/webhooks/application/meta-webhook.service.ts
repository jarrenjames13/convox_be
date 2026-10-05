import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MessageType } from '@prisma/client';
import type { Queue } from 'bullmq';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ApplicationException } from '../../../core/common/application.exception';
import type {
  JsonValue,
  NormalizedIncomingMessage,
} from './incoming-message-repository.port';
import {
  META_INCOMING_MESSAGE_JOB,
  META_INCOMING_QUEUE,
} from './meta-webhook-queue';

@Injectable()
export class MetaWebhookService {
  private readonly verifyToken: string;
  private readonly appSecret: string;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(META_INCOMING_QUEUE) private readonly queue: Queue,
  ) {
    this.verifyToken =
      config.get<string>('META_WEBHOOK_VERIFY_TOKEN')?.trim() ?? '';
    this.appSecret = config.get<string>('META_APP_SECRET')?.trim() ?? '';
  }

  verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    if (
      mode !== 'subscribe' ||
      !token ||
      !challenge ||
      !this.verifyToken ||
      !constantTimeEquals(token, this.verifyToken)
    ) {
      throw new ApplicationException(
        'FACEBOOK_WEBHOOK_VERIFICATION_FAILED',
        'Facebook webhook verification failed.',
        HttpStatus.FORBIDDEN,
      );
    }
    return challenge;
  }

  verifySignature(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ): void {
    if (!this.appSecret || !rawBody || !signature) this.invalidSignature();
    const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
    if (!match) this.invalidSignature();
    const expected = createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest();
    const actual = Buffer.from(match[1], 'hex');
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      this.invalidSignature();
    }
  }

  async enqueue(
    body: unknown,
  ): Promise<{ status: 'accepted'; queued: number }> {
    const messages = normalizeMetaPayload(body);
    for (const message of messages) {
      const jobId = createHash('sha256')
        .update(`${message.pageMetaId}:${message.metaMessageId}`)
        .digest('hex');
      await this.queue.add(META_INCOMING_MESSAGE_JOB, message, {
        jobId,
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    }
    return { status: 'accepted', queued: messages.length };
  }

  private invalidSignature(): never {
    throw new ApplicationException(
      'FACEBOOK_WEBHOOK_SIGNATURE_INVALID',
      'Facebook webhook signature is invalid.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export function normalizeMetaPayload(
  body: unknown,
): NormalizedIncomingMessage[] {
  if (!isRecord(body) || body.object !== 'page' || !Array.isArray(body.entry)) {
    throw new ApplicationException(
      'INVALID_META_WEBHOOK_PAYLOAD',
      'The Facebook webhook payload is invalid.',
      HttpStatus.BAD_REQUEST,
    );
  }

  const normalized: NormalizedIncomingMessage[] = [];
  const seen = new Set<string>();
  for (const entry of body.entry) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !Array.isArray(entry.messaging)
    ) {
      throw new ApplicationException(
        'INVALID_META_WEBHOOK_PAYLOAD',
        'The Facebook webhook entry is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const event of entry.messaging) {
      if (
        !isRecord(event) ||
        !isRecord(event.message) ||
        event.message.is_echo === true
      )
        continue;
      const message = event.message;
      const sender = isRecord(event.sender) ? event.sender : null;
      const timestamp = event.timestamp;
      if (
        typeof message.mid !== 'string' ||
        typeof sender?.id !== 'string' ||
        sender.id === entry.id ||
        (typeof timestamp !== 'number' && typeof timestamp !== 'string')
      ) {
        continue;
      }
      const stamp =
        typeof timestamp === 'number'
          ? new Date(timestamp)
          : new Date(timestamp);
      if (Number.isNaN(stamp.getTime())) continue;
      const uniqueKey = `${entry.id}:${message.mid}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const attachments = Array.isArray(message.attachments)
        ? sanitizeJson(message.attachments)
        : undefined;
      const messageType = mapMessageType(message);
      normalized.push({
        pageMetaId: entry.id,
        metaMessageId: message.mid,
        senderPsid: sender.id,
        timestamp: stamp.toISOString(),
        content: typeof message.text === 'string' ? message.text : null,
        messageType,
        ...(attachments ? { metadata: { attachments } } : {}),
      });
    }
  }
  return normalized;
}

function mapMessageType(message: Record<string, unknown>): MessageType {
  if (typeof message.text === 'string') return MessageType.TEXT;
  const firstAttachment: unknown = Array.isArray(message.attachments)
    ? message.attachments[0]
    : undefined;
  const type =
    isRecord(firstAttachment) && typeof firstAttachment.type === 'string'
      ? firstAttachment.type.toLowerCase()
      : '';
  switch (type) {
    case 'image':
      return MessageType.IMAGE;
    case 'video':
      return MessageType.VIDEO;
    case 'audio':
      return MessageType.AUDIO;
    case 'file':
      return MessageType.FILE;
    case 'sticker':
      return MessageType.STICKER;
    default:
      return MessageType.OTHER;
  }
}

function sanitizeJson(value: unknown, depth = 0): JsonValue {
  if (depth > 6) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key.slice(0, 100),
          sanitizeJson(item, depth + 1),
        ]),
    );
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
