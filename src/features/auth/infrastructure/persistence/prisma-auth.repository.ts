import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  AuthCredentials,
  AuthIdentity,
  AuthRepository,
  RefreshTokenRecordInput,
  RotationResult,
} from '../../application/auth-repository.port';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCredentialsByEmail(email: string): Promise<AuthCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });
  }

  async updateLastLogin(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: at },
    });
  }

  async createRefreshToken(input: RefreshTokenRecordInput): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
    });
  }

  rotateRefreshToken(input: {
    currentHash: string;
    next: Omit<RefreshTokenRecordInput, 'userId' | 'familyId'>;
    now: Date;
  }): Promise<RotationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.refreshToken.findUnique({
        where: { tokenHash: input.currentHash },
        select: { userId: true, familyId: true },
      });
      if (!identity) return { status: 'invalid' };
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${identity.userId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity.familyId}, 0))`;
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM refresh_tokens WHERE token_hash = ${input.currentHash} FOR UPDATE
      `;
      if (!locked.length) return { status: 'invalid' };

      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash: input.currentHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              isActive: true,
            },
          },
        },
      });
      if (!current) return { status: 'invalid' };

      if (current.revokedAt) {
        await transaction.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        return { status: 'replayed' };
      }

      if (current.expiresAt <= input.now) {
        await transaction.refreshToken.update({
          where: { id: current.id },
          data: { revokedAt: input.now },
        });
        return { status: 'invalid' };
      }

      if (!current.user.isActive) {
        await transaction.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        return { status: 'disabled' };
      }

      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { revokedAt: input.now, replacedBy: input.next.tokenHash },
      });
      await transaction.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: input.next.tokenHash,
          familyId: current.familyId,
          expiresAt: input.next.expiresAt,
          userAgent: input.next.userAgent,
          ipAddress: input.next.ipAddress,
        },
      });

      return { status: 'rotated', user: current.user };
    });
  }

  async revokeRefreshTokenFamily(tokenHash: string, at: Date): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, familyId: true },
      });
      if (!token) return;
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${token.userId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${token.familyId}, 0))`;
      await transaction.refreshToken.updateMany({
        where: { familyId: token.familyId, revokedAt: null },
        data: { revokedAt: at },
      });
    });
  }
}

export type { AuthIdentity };
