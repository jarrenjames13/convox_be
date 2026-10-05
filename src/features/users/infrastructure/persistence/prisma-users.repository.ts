import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import type { UsersRepository } from '../../application/users-repository.port';

const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
} as const;
@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}
  listAdmins() {
    return this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: profileSelect,
      orderBy: { fullName: 'asc' },
    });
  }
  createAdmin(input: Parameters<UsersRepository['createAdmin']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: input.passwordHash,
          role: 'ADMIN',
        },
        select: profileSelect,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorId,
          action: 'admin.created',
          resourceType: 'user',
          resourceId: admin.id,
        },
      });
      return admin;
    });
  }
  updateAdmin(input: Parameters<UsersRepository['updateAdmin']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.user.findFirst({
        where: { id: input.id, role: 'ADMIN' },
        select: { id: true },
      });
      if (!found) return null;
      const admin = await tx.user.update({
        where: { id: input.id },
        data: { fullName: input.fullName, isActive: input.isActive },
        select: profileSelect,
      });
      if (input.isActive === false)
        await tx.refreshToken.updateMany({
          where: { userId: input.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorId,
          action:
            input.isActive === false
              ? 'admin.disabled'
              : input.isActive === true
                ? 'admin.enabled'
                : 'admin.updated',
          resourceType: 'user',
          resourceId: input.id,
        },
      });
      return admin;
    });
  }
}
