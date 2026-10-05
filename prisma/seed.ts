import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Development seed is disabled in production.');
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const agentPassword = process.env.SEED_AGENT_PASSWORD;
  const metaPageId = process.env.META_PAGE_ID?.trim();
  if (
    !email ||
    !password ||
    !agentPassword ||
    password.length < 12 ||
    agentPassword.length < 12 ||
    !metaPageId
  ) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_AGENT_PASSWORD (minimum 12 characters) and META_PAGE_ID before seeding.',
    );
  }
  const [adminHash, agentHash] = await Promise.all([
    argon2.hash(password),
    argon2.hash(agentPassword),
  ]);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { role: true },
    });
    if (existing && existing.role !== 'SUPER_ADMIN')
      throw new Error(
        'The seed admin email already belongs to a different role.',
      );
    const admin = await tx.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash: adminHash,
        fullName: 'Development Super Admin',
        role: 'SUPER_ADMIN',
      },
      update: {},
    });
    const page = await tx.facebookPage.upsert({
      where: { metaPageId },
      create: { metaPageId, name: 'Development Facebook Page' },
      update: {},
    });
    for (const [agentEmail, fullName] of [
      ['alice@convox.local', 'Alice'],
      ['bob@convox.local', 'Bob'],
    ]) {
      const found = await tx.user.findUnique({
        where: { email: agentEmail },
        select: { role: true },
      });
      if (found && found.role !== 'AGENT')
        throw new Error('A seed agent email belongs to a different role.');
      const agent = await tx.user.upsert({
        where: { email: agentEmail },
        create: {
          email: agentEmail,
          passwordHash: agentHash,
          fullName,
          role: 'AGENT',
          agentProfile: { create: { maxActiveConversations: 10 } },
        },
        update: {},
      });
      await tx.pageAgent.upsert({
        where: { pageId_agentId: { pageId: page.id, agentId: agent.id } },
        create: { pageId: page.id, agentId: agent.id },
        update: {},
      });
    }
    await tx.routingState.upsert({
      where: { pageId: page.id },
      create: { pageId: page.id },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: 'development.seed',
        resourceType: 'system',
      },
    });
  });
}

void seed()
  .catch(() => {
    // Never print provider errors which may contain connection credentials.
    console.error(
      'Development seed failed. Check seed configuration and database connectivity.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
