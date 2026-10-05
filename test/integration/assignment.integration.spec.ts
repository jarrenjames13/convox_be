import { ConfigService } from '@nestjs/config';
import {
  AssignmentType,
  ConversationStatus,
  MessageType,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaAssignmentRepository } from '../../src/features/assignments/infrastructure/persistence/prisma-assignment.repository';
import { PrismaIncomingMessageRepository } from '../../src/features/webhooks/infrastructure/persistence/prisma-incoming-message.repository';
import { PrismaService } from '../../src/core/database/prisma.service';

const suffix = randomUUID();

describe('conversation assignment and Meta ingestion (PostgreSQL)', () => {
  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
  );
  const assignments = new PrismaAssignmentRepository(prisma);
  const incoming = new PrismaIncomingMessageRepository(prisma, assignments, {
    getOrThrow: () => 24,
  } as unknown as ConfigService);
  let pageId: string;
  let agentAId: string;
  let agentBId: string;
  let adminId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const page = await prisma.facebookPage.create({
      data: { metaPageId: `test-page-${suffix}`, name: 'Integration Page' },
    });
    pageId = page.id;
    const [agentA, agentB, admin] = await Promise.all([
      createAgent(prisma, `a-${suffix}@example.test`, 'Agent A'),
      createAgent(prisma, `b-${suffix}@example.test`, 'Agent B'),
      prisma.user.create({
        data: {
          email: `admin-${suffix}@example.test`,
          passwordHash: 'test-only',
          fullName: 'Integration Admin',
          role: UserRole.ADMIN,
        },
      }),
    ]);
    agentAId = agentA.id;
    agentBId = agentB.id;
    adminId = admin.id;
    await prisma.pageAgent.createMany({
      data: [
        { pageId, agentId: agentAId },
        { pageId, agentId: agentBId },
      ],
    });
    await prisma.routingState.create({ data: { pageId, version: 0 } });
  });

  beforeEach(async () => {
    await prisma.conversation.deleteMany({ where: { pageId } });
    await prisma.contact.deleteMany({ where: { pageId } });
    await prisma.routingState.update({
      where: { pageId },
      data: { lastAssignedAgentId: null, version: 0 },
    });
  });

  afterAll(async () => {
    await prisma.facebookPage.deleteMany({ where: { id: pageId } });
    await prisma.user.deleteMany({
      where: { id: { in: [agentAId, agentBId, adminId] } },
    });
    await prisma.$disconnect();
  });

  it('keeps two concurrent messages from one customer in a single assigned conversation', async () => {
    const senderPsid = `psid-${suffix}-same`;
    const [first, second] = await Promise.all([
      incoming.processMessage(inbound(`message-a-${suffix}`, senderPsid)),
      incoming.processMessage(inbound(`message-b-${suffix}`, senderPsid)),
    ]);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    if (first.duplicate || second.duplicate)
      throw new Error('Expected both distinct messages to persist.');
    expect(first.conversationId).toBe(second.conversationId);
    expect(first.assignedAgentId).toBeTruthy();
    expect(second.assignedAgentId).toBe(first.assignedAgentId);
    expect(
      await prisma.conversation.count({
        where: {
          pageId,
          contact: { metaPsid: senderPsid },
          status: { in: activeStatuses },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.conversationAssignment.count({
        where: { conversationId: first.conversationId },
      }),
    ).toBe(1);
  });

  it('assigns simultaneous new conversations to different agents and advances the Page cursor twice', async () => {
    const [left, right] = await Promise.all([
      incoming.processMessage(
        inbound(`message-c-${suffix}`, `psid-${suffix}-left`),
      ),
      incoming.processMessage(
        inbound(`message-d-${suffix}`, `psid-${suffix}-right`),
      ),
    ]);
    if (left.duplicate || right.duplicate)
      throw new Error('Expected new conversations.');

    expect(new Set([left.assignedAgentId, right.assignedAgentId])).toEqual(
      new Set([agentAId, agentBId]),
    );
    expect(
      await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
    ).toMatchObject({ version: 2 });
  });

  it('does not advance the routing cursor or write history when assignment transaction rolls back', async () => {
    const contact = await prisma.contact.create({
      data: { pageId, metaPsid: `psid-${suffix}-rollback` },
    });
    const conversation = await prisma.conversation.create({
      data: {
        pageId,
        contactId: contact.id,
        status: ConversationStatus.UNASSIGNED,
      },
    });

    await expect(
      prisma.$transaction(async (transaction) => {
        await assignments.assignRoundRobinInTransaction(
          transaction,
          conversation.id,
        );
        throw new Error('force transaction rollback');
      }),
    ).rejects.toThrow('force transaction rollback');

    expect(
      await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
    ).toMatchObject({
      lastAssignedAgentId: null,
      version: 0,
    });
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
      }),
    ).toMatchObject({
      assignedAgentId: null,
      status: ConversationStatus.UNASSIGNED,
    });
    expect(
      await prisma.conversationAssignment.count({
        where: { conversationId: conversation.id },
      }),
    ).toBe(0);
  });

  it('deduplicates webhook retries without creating another assignment or cursor advance', async () => {
    const event = inbound(
      `message-idempotent-${suffix}`,
      `psid-${suffix}-idempotent`,
    );
    const first = await incoming.processMessage(event);
    const retry = await incoming.processMessage(event);

    expect(first.duplicate).toBe(false);
    expect(retry).toEqual({ duplicate: true });
    if (first.duplicate)
      throw new Error('Expected the first delivery to persist.');
    expect(
      await prisma.message.count({
        where: { metaMessageId: event.metaMessageId },
      }),
    ).toBe(1);
    expect(
      await prisma.conversationAssignment.count({
        where: { conversationId: first.conversationId },
      }),
    ).toBe(1);
    expect(
      await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
    ).toMatchObject({ version: 1 });
  });

  it('keeps a conversation unassigned and preserves the cursor when no candidate is eligible', async () => {
    const contact = await prisma.contact.create({
      data: { pageId, metaPsid: `psid-${suffix}-unavailable` },
    });
    const conversation = await prisma.conversation.create({
      data: {
        pageId,
        contactId: contact.id,
        status: ConversationStatus.UNASSIGNED,
      },
    });
    await prisma.agentProfile.updateMany({
      where: { userId: { in: [agentAId, agentBId] } },
      data: { acceptingConversations: false },
    });
    try {
      await expect(
        assignments.assignRoundRobin(conversation.id),
      ).resolves.toMatchObject({ status: 'no_agent' });
      expect(
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
      ).toMatchObject({
        assignedAgentId: null,
        status: ConversationStatus.UNASSIGNED,
      });
      expect(
        await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
      ).toMatchObject({
        lastAssignedAgentId: null,
        version: 0,
      });
      expect(
        await prisma.conversationAssignment.count({
          where: { conversationId: conversation.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.agentProfile.updateMany({
        where: { userId: { in: [agentAId, agentBId] } },
        data: { acceptingConversations: true },
      });
    }
  });

  it('keeps round-robin cursors isolated by Page', async () => {
    const otherPage = await prisma.facebookPage.create({
      data: {
        metaPageId: `test-page-other-${suffix}`,
        name: 'Other Integration Page',
      },
    });
    try {
      await prisma.pageAgent.createMany({
        data: [
          { pageId: otherPage.id, agentId: agentAId },
          { pageId: otherPage.id, agentId: agentBId },
        ],
      });
      const contact = await prisma.contact.create({
        data: { pageId: otherPage.id, metaPsid: `psid-${suffix}-other-page` },
      });
      const conversation = await prisma.conversation.create({
        data: { pageId: otherPage.id, contactId: contact.id },
      });
      await expect(
        assignments.assignRoundRobin(conversation.id),
      ).resolves.toMatchObject({ status: 'assigned' });
      expect(
        await prisma.routingState.findUniqueOrThrow({
          where: { pageId: otherPage.id },
        }),
      ).toMatchObject({ version: 1 });
      expect(
        await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
      ).toMatchObject({ version: 0, lastAssignedAgentId: null });
    } finally {
      await prisma.facebookPage.delete({ where: { id: otherPage.id } });
    }
  });

  it('reopens a recently resolved conversation and retains its eligible agent', async () => {
    const contact = await prisma.contact.create({
      data: { pageId, metaPsid: `psid-${suffix}-reopen` },
    });
    const resolvedAt = new Date(Date.now() - 60 * 60 * 1000);
    const conversation = await prisma.conversation.create({
      data: {
        pageId,
        contactId: contact.id,
        assignedAgentId: agentAId,
        status: ConversationStatus.RESOLVED,
        assignedAt: resolvedAt,
        resolvedAt,
      },
    });
    const cursorBefore = await prisma.routingState.findUniqueOrThrow({
      where: { pageId },
    });

    const result = await incoming.processMessage(
      inbound(`message-reopen-${suffix}`, `psid-${suffix}-reopen`),
    );

    expect(result.duplicate).toBe(false);
    if (result.duplicate)
      throw new Error('Expected the reopen message to persist.');
    expect(result.conversationId).toBe(conversation.id);
    expect(result.createdConversation).toBe(false);
    expect(result.assignedAgentId).toBe(agentAId);
    expect(
      await prisma.conversationAssignment.findFirstOrThrow({
        where: {
          conversationId: conversation.id,
          assignmentType: AssignmentType.REOPEN,
        },
      }),
    ).toMatchObject({ toAgentId: agentAId });
    expect(
      await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
    ).toMatchObject({
      version: cursorBefore.version,
      lastAssignedAgentId: cursorBefore.lastAssignedAgentId,
    });
  });

  it('starts a new round-robin conversation when the resolved reopen window has expired', async () => {
    const contact = await prisma.contact.create({
      data: { pageId, metaPsid: `psid-${suffix}-reopen-old` },
    });
    const resolvedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const oldConversation = await prisma.conversation.create({
      data: {
        pageId,
        contactId: contact.id,
        assignedAgentId: agentAId,
        status: ConversationStatus.RESOLVED,
        assignedAt: resolvedAt,
        resolvedAt,
      },
    });

    const result = await incoming.processMessage(
      inbound(
        `message-new-after-window-${suffix}`,
        `psid-${suffix}-reopen-old`,
      ),
    );

    expect(result.duplicate).toBe(false);
    if (result.duplicate) throw new Error('Expected a new conversation.');
    expect(result.conversationId).not.toBe(oldConversation.id);
    expect(result.createdConversation).toBe(true);
    expect(result.assignedAgentId).toBeTruthy();
    expect(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: oldConversation.id },
      }),
    ).toMatchObject({ status: ConversationStatus.RESOLVED });
  });

  it('records manual assignment and audit atomically without changing the round-robin cursor', async () => {
    const first = await incoming.processMessage(
      inbound(`message-manual-${suffix}`, `psid-${suffix}-manual`),
    );
    if (first.duplicate) throw new Error('Expected new conversation.');
    const cursorBefore = await prisma.routingState.findUniqueOrThrow({
      where: { pageId },
    });
    const reassignedAgentId =
      first.assignedAgentId === agentAId ? agentBId : agentAId;

    const result = await assignments.manualAssign({
      conversationId: first.conversationId,
      agentId: reassignedAgentId,
      actorUserId: adminId,
      reason: 'Integration test reassignment',
    });

    expect(result).toMatchObject({
      status: 'assigned',
      fromAgentId: first.assignedAgentId,
      toAgentId: reassignedAgentId,
    });
    expect(
      await prisma.routingState.findUniqueOrThrow({ where: { pageId } }),
    ).toMatchObject({
      lastAssignedAgentId: cursorBefore.lastAssignedAgentId,
      version: cursorBefore.version,
    });
    expect(
      await prisma.conversationAssignment.findFirstOrThrow({
        where: {
          conversationId: first.conversationId,
          assignmentType: AssignmentType.MANUAL,
        },
      }),
    ).toMatchObject({
      assignedByUserId: adminId,
      toAgentId: reassignedAgentId,
    });
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'conversation.manually_assigned',
          resourceId: first.conversationId,
        },
      }),
    ).toMatchObject({ actorUserId: adminId });
  });
});

const activeStatuses = [
  ConversationStatus.UNASSIGNED,
  ConversationStatus.ASSIGNED,
  ConversationStatus.IN_PROGRESS,
  ConversationStatus.WAITING_CUSTOMER,
];

function inbound(metaMessageId: string, senderPsid: string) {
  return {
    pageMetaId: `test-page-${suffix}`,
    metaMessageId,
    senderPsid,
    timestamp: new Date().toISOString(),
    content: 'Integration test message',
    messageType: MessageType.TEXT,
  };
}

async function createAgent(
  prisma: PrismaClient,
  email: string,
  fullName: string,
) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: 'test-only',
      fullName,
      role: UserRole.AGENT,
      agentProfile: {
        create: {
          presenceStatus: 'ONLINE',
          acceptingConversations: true,
          maxActiveConversations: 100,
        },
      },
    },
  });
}
