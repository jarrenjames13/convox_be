import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import {
  MetaWebhookService,
  normalizeMetaPayload,
} from './meta-webhook.service';

describe('MetaWebhookService', () => {
  it('verifies x-hub-signature-256 against the raw request body', () => {
    const body = Buffer.from('{"object":"page"}');
    const secret = 'test-meta-app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const service = createService({ META_APP_SECRET: secret });

    expect(() => service.verifySignature(signature, body)).not.toThrow();
    expect(() => service.verifySignature('sha256=invalid', body)).toThrow(
      'Facebook webhook signature is invalid.',
    );
  });

  it('normalizes inbound messages, ignores echoes, and removes same-request duplicates', () => {
    const messages = normalizeMetaPayload({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'customer-1' },
              timestamp: 1_760_000_000_000,
              message: { mid: 'mid-1', text: 'Hi' },
            },
            {
              sender: { id: 'page-1' },
              timestamp: 1_760_000_000_001,
              message: { mid: 'echo-1', text: 'Hi', is_echo: true },
            },
            {
              sender: { id: 'customer-1' },
              timestamp: 1_760_000_000_000,
              message: { mid: 'mid-1', text: 'Hi' },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      pageMetaId: 'page-1',
      senderPsid: 'customer-1',
      metaMessageId: 'mid-1',
      content: 'Hi',
      messageType: 'TEXT',
    });
    expect(messages[0].timestamp).toBe(
      new Date(1_760_000_000_000).toISOString(),
    );
  });

  it('retains attachment metadata without requiring a text body', () => {
    const [message] = normalizeMetaPayload({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'customer-1' },
              timestamp: 1_760_000_000_000,
              message: {
                mid: 'mid-image',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://example.test/image.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(message).toMatchObject({ messageType: 'IMAGE', content: null });
    expect(message.metadata).toEqual({
      attachments: [
        { type: 'image', payload: { url: 'https://example.test/image.jpg' } },
      ],
    });
  });
});

function createService(values: Record<string, string>) {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
  return new MetaWebhookService(config, queue);
}
