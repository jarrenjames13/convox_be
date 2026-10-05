import { UserRole } from '@prisma/client';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthIdentity {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface AuthCredentials extends AuthIdentity {
  passwordHash: string;
}

export interface RefreshTokenRecordInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export type RotationResult =
  | { status: 'rotated'; user: AuthIdentity }
  | { status: 'invalid' | 'replayed' | 'disabled' };

export interface AuthRepository {
  findCredentialsByEmail(email: string): Promise<AuthCredentials | null>;
  updateLastLogin(userId: string, at: Date): Promise<void>;
  createRefreshToken(input: RefreshTokenRecordInput): Promise<void>;
  rotateRefreshToken(input: {
    currentHash: string;
    next: Omit<RefreshTokenRecordInput, 'userId' | 'familyId'>;
    now: Date;
  }): Promise<RotationResult>;
  revokeRefreshTokenFamily(tokenHash: string, at: Date): Promise<void>;
}
