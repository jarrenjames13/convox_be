import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../src/core/database/prisma.service';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/core/config/configure-app';
import { createHmac, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import axios from 'axios';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

const suffix = randomUUID();
const pageMetaId = 'convox-e2e-page';
const appSecret = 'e2e-app-secret-test-only';
const verifyToken = 'e2e-verify-token-test-only';
let app: INestApplication;
let prisma: PrismaService;
let baseUrl: string;
let adminId: string;
let adminEmail: string;
let adminPassword: string;
let httpServer: Server;

describe('Messenger API workflow (E2E)', () => {
  let adminToken: string;
  let agentA: { id: string; accessToken: string };
  let agentB: { id: string; accessToken: string };
  let conversationId: string;
  let pageId: string;
  let customerPsid: string;
  let axiosSpy: jest.SpyInstance;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, {
      rawBody: true,
      logger: false,
      abortOnError: false,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const rawServer: unknown = app.getHttpServer();
    httpServer = rawServer as Server;
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected an HTTP TCP listener.');
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);

    const email = `super-${suffix}@example.test`;
    const password = 'e2e-super-admin-password';
    adminEmail = email;
    adminPassword = password;
    const admin = await prisma.user.create({
      data: {
        email,
        fullName: 'E2E Super Admin',
        passwordHash: await argon2.hash(password),
        role: 'SUPER_ADMIN',
      },
    });
    adminId = admin.id;
    const login = await appRequest()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    adminToken = body<{ accessToken: string }>(login).accessToken;
    pageId = (
      await prisma.facebookPage.findUniqueOrThrow({
        where: { metaPageId: pageMetaId },
      })
    ).id;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    jest.restoreAllMocks();
    if (prisma) {
      await prisma.facebookPage.deleteMany({
        where: { metaPageId: pageMetaId },
      });
      await prisma.user.deleteMany({
        where: { email: { endsWith: `-${suffix}@example.test` } },
      });
      if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    }
    await app?.close();
  });

  it('serves readiness, Swagger, and Meta webhook verification', async () => {
    const liveness = await appRequest().get('/api/health/live').expect(200);
    expect(body<{ status: string }>(liveness).status).toBe('ok');
    const readiness = await appRequest().get('/api/health/ready').expect(200);
    expect(
      body<{ status: string; database: string; redis: string }>(readiness),
    ).toEqual({
      status: 'ok',
      database: 'connected',
      redis: 'connected',
    });
    await appRequest().get('/api/docs').expect(200);
    await appRequest()
      .get('/api/v1/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': 'challenge-value',
      })
      .expect(200)
      .expect('challenge-value');
    await appRequest()
      .get('/api/v1/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': 'challenge-value',
      })
      .expect(403);
  });

  it('authenticates, creates agents, ingests idempotently, replies, reassigns, and enforces socket/API ownership', async () => {
    const adminProfile = await appRequest()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(body<{ user: object }>(adminProfile).user).not.toHaveProperty(
      'passwordHash',
    );
    await appRequest().get('/api/v1/auth/me').expect(401);

    agentA = await createAgent('Alice');
    agentB = await createAgent('Bob');
    await appRequest()
      .post(`/api/v1/pages/${pageId}/agents`)
      .set(bearer(adminToken))
      .send({ agentId: agentA.id })
      .expect(201);
    await appRequest()
      .post(`/api/v1/pages/${pageId}/agents`)
      .set(bearer(adminToken))
      .send({ agentId: agentB.id })
      .expect(201);
    await appRequest()
      .patch('/api/v1/agents/me/presence')
      .set(bearer(agentA.accessToken))
      .send({ presenceStatus: 'ONLINE', acceptingConversations: true })
      .expect(200);
    await appRequest()
      .patch('/api/v1/agents/me/presence')
      .set(bearer(agentB.accessToken))
      .send({ presenceStatus: 'ONLINE', acceptingConversations: true })
      .expect(200);

    customerPsid = `customer-${suffix}`;
    const webhookPayload = {
      object: 'page',
      entry: [
        {
          id: pageMetaId,
          messaging: [
            {
              sender: { id: customerPsid },
              recipient: { id: pageMetaId },
              timestamp: Date.now(),
              message: {
                mid: `meta-in-${suffix}`,
                text: 'Hello from Messenger',
              },
            },
          ],
        },
      ],
    };
    const serialized = JSON.stringify(webhookPayload);
    const signature = `sha256=${createHmac('sha256', appSecret).update(serialized).digest('hex')}`;
    await appRequest()
      .post('/api/v1/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send(serialized)
      .expect(401);
    const queued = await appRequest()
      .post('/api/v1/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(serialized)
      .expect(200);
    expect(body<{ status: string; queued: number }>(queued)).toEqual({
      status: 'accepted',
      queued: 1,
    });

    const conversation = await waitForConversation(customerPsid);
    conversationId = conversation.id;
    expect([agentA.id, agentB.id]).toContain(conversation.assignedAgentId);
    expect(
      await prisma.conversationAssignment.count({ where: { conversationId } }),
    ).toBe(1);
    const inboundCount = await prisma.message.count({
      where: { conversationId, direction: 'INBOUND' },
    });
    await appRequest()
      .post('/api/v1/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(serialized)
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(
      await prisma.message.count({
        where: { conversationId, direction: 'INBOUND' },
      }),
    ).toBe(inboundCount);
    expect(
      await prisma.conversationAssignment.count({ where: { conversationId } }),
    ).toBe(1);

    const assignedAgent =
      conversation.assignedAgentId === agentA.id ? agentA : agentB;
    const previousAgent = assignedAgent.id === agentA.id ? agentB : agentA;
    axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { recipient_id: customerPsid, message_id: `meta-out-${suffix}` },
    });
    await appRequest()
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(bearer(assignedAgent.accessToken))
      .send({ text: 'Reply from agent' })
      .expect(201);
    expect(axiosSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/${pageMetaId}/messages`),
      expect.objectContaining({ messaging_type: 'RESPONSE' }),
      expect.objectContaining({
        params: { access_token: 'fake-development-page-token' },
      }),
    );

    await appRequest()
      .post(`/api/v1/conversations/${conversationId}/assign`)
      .set(bearer(assignedAgent.accessToken))
      .send({ agentId: previousAgent.id })
      .expect(403);
    await appRequest()
      .post(`/api/v1/conversations/${conversationId}/assign`)
      .set(bearer(adminToken))
      .send({ agentId: previousAgent.id, reason: 'Coverage handoff' })
      .expect(201);
    await appRequest()
      .get(`/api/v1/conversations/${conversationId}`)
      .set(bearer(assignedAgent.accessToken))
      .expect(403);
    await appRequest()
      .get(`/api/v1/conversations/${conversationId}`)
      .set(bearer(previousAgent.accessToken))
      .expect(200);

    const unauthenticated = io(`${baseUrl}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
    });
    sockets.push(unauthenticated);
    await expectSocketError(unauthenticated);
    const authorized = io(`${baseUrl}/realtime`, {
      auth: { token: previousAgent.accessToken },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    sockets.push(authorized);
    await waitForSocket(authorized);
    const joinedResult: unknown = await authorized
      .timeout(3000)
      .emitWithAck('conversation.join', { conversationId });
    expect(asRecord(joinedResult).joined).toBe(true);
    const oldOwner = io(`${baseUrl}/realtime`, {
      auth: { token: assignedAgent.accessToken },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    sockets.push(oldOwner);
    await waitForSocket(oldOwner);
    const deniedResult: unknown = await oldOwner
      .timeout(3000)
      .emitWithAck('conversation.join', { conversationId });
    expect(asRecord(asRecord(deniedResult).error).code).toBe('FORBIDDEN');

    await appRequest()
      .patch(`/api/v1/conversations/${conversationId}/status`)
      .set(bearer(previousAgent.accessToken))
      .send({ status: 'WAITING_CUSTOMER' })
      .expect(200);
    await appRequest()
      .patch(`/api/v1/conversations/${conversationId}/status`)
      .set(bearer(previousAgent.accessToken))
      .send({ status: 'RESOLVED' })
      .expect(200);
    const analytics = await appRequest()
      .get('/api/v1/analytics/overview')
      .set(bearer(adminToken))
      .expect(200);
    expect(
      body<{ resolvedConversations: number }>(analytics).resolvedConversations,
    ).toBeGreaterThan(0);

    await appRequest()
      .patch(`/api/v1/agents/${previousAgent.id}/status`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(200);
    await appRequest()
      .get('/api/v1/auth/me')
      .set(bearer(previousAgent.accessToken))
      .expect(401);
    expect(authorized.connected).toBe(false);
    const disabledName = previousAgent.id === agentA.id ? 'alice' : 'bob';
    await appRequest()
      .post('/api/v1/auth/login')
      .send({
        email: `${disabledName}-${suffix}@example.test`,
        password: `agent-${disabledName}-password`,
      })
      .expect(401);
  });

  it('restricts administrator creation to Super Admins', async () => {
    const email = `admin-${suffix}@example.test`;
    const password = 'e2e-admin-account-password';
    const created = await appRequest()
      .post('/api/v1/users/admins')
      .set(bearer(adminToken))
      .send({ email, fullName: 'E2E Admin', password })
      .expect(201);
    expect(
      body<{ passwordHash?: string }>(created).passwordHash,
    ).toBeUndefined();

    const login = await appRequest()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const adminAccess = body<{ accessToken: string }>(login).accessToken;
    await appRequest()
      .post('/api/v1/users/admins')
      .set(bearer(adminAccess))
      .send({
        email: `blocked-${suffix}@example.test`,
        fullName: 'Blocked',
        password,
      })
      .expect(403);
  });

  it('rotates refresh tokens, detects replay, and revokes a logged-out token family', async () => {
    const login = await appRequest()
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const original = body<{ refreshToken: string }>(login).refreshToken;
    const refreshResponse = await appRequest()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(200);
    const replacement = body<{ refreshToken: string }>(
      refreshResponse,
    ).refreshToken;
    const replay = await appRequest()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original })
      .expect(401);
    expect(body<{ error: { code: string } }>(replay).error.code).toBe(
      'REFRESH_TOKEN_REUSED',
    );
    await appRequest()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: replacement })
      .expect(401);

    const logoutLogin = await appRequest()
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const logoutToken = body<{ refreshToken: string }>(
      logoutLogin,
    ).refreshToken;
    await appRequest()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: logoutToken })
      .expect(204);
    await appRequest()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: logoutToken })
      .expect(401);
  });

  async function createAgent(
    name: string,
  ): Promise<{ id: string; accessToken: string }> {
    const email = `${name.toLowerCase()}-${suffix}@example.test`;
    const password = `agent-${name.toLowerCase()}-password`;
    const created = await appRequest()
      .post('/api/v1/agents')
      .set(bearer(adminToken))
      .send({ email, fullName: name, password, maxActiveConversations: 5 })
      .expect(201);
    const login = await appRequest()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: body<{ userId: string }>(created).userId,
      accessToken: body<{ accessToken: string }>(login).accessToken,
    };
  }

  async function waitForConversation(
    psid: string,
  ): Promise<{ id: string; assignedAgentId: string | null }> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const conversation = await prisma.conversation.findFirst({
        where: { pageId, contact: { metaPsid: psid } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, assignedAgentId: true },
      });
      if (conversation) return conversation;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('The incoming Messenger job was not processed.');
  }
});

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}
function appRequest() {
  return request(httpServer);
}
function body<T>(response: { body: unknown }): T {
  return response.body as T;
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
function waitForSocket(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}
function expectSocketError(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect_error', () => resolve());
    socket.once('connect', () =>
      reject(new Error('Unauthenticated socket unexpectedly connected.')),
    );
  });
}
