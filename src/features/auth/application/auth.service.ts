import {
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { AUTH_REPOSITORY } from './auth-repository.port';
import type {
  AuthIdentity,
  AuthRepository,
  RefreshTokenRecordInput,
} from './auth-repository.port';
import { ApplicationException } from '../../../core/common/application.exception';

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthIdentity;
}

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlDays: number;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshPepper: string;
  private readonly dummyPasswordHash = argon2.hash(
    randomBytes(32).toString('hex'),
  );

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshTokenTtlDays = config.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_DAYS',
    );
    this.accessTokenTtlSeconds = config.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );
    this.refreshPepper = config.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
  }

  async login(
    email: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<TokenResponse> {
    const user = await this.repository.findCredentialsByEmail(
      email.toLowerCase(),
    );
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const validPassword = await argon2
      .verify(passwordHash, password)
      .catch(() => false);
    if (!user?.isActive || !validPassword)
      throw new UnauthorizedException('Invalid email or password.');

    await this.repository.updateLastLogin(user.id, new Date());
    return this.createSession(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
      randomUUID(),
      metadata,
    );
  }

  async refresh(
    rawToken: string,
    metadata: RequestMetadata,
  ): Promise<TokenResponse> {
    const rawNextToken = this.newOpaqueToken();
    const next = this.makeReplacementRecord(rawNextToken, metadata);
    const result = await this.repository.rotateRefreshToken({
      currentHash: this.hashToken(rawToken),
      next,
      now: new Date(),
    });

    if (result.status === 'replayed') {
      throw new ApplicationException(
        'REFRESH_TOKEN_REUSED',
        'Refresh token reuse was detected.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (result.status === 'disabled') throw new UnauthorizedException();
    if (result.status !== 'rotated')
      throw new UnauthorizedException('Invalid refresh token.');

    const accessToken = await this.signAccessToken(result.user);
    return {
      accessToken,
      refreshToken: rawNextToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
      user: result.user,
    };
  }

  async logout(rawToken: string): Promise<void> {
    await this.repository.revokeRefreshTokenFamily(
      this.hashToken(rawToken),
      new Date(),
    );
  }

  private async createSession(
    user: AuthIdentity,
    familyId: string,
    metadata: RequestMetadata,
  ): Promise<TokenResponse> {
    const refreshToken = this.newOpaqueToken();
    await this.repository.createRefreshToken(
      this.makeRefreshRecord(user.id, refreshToken, familyId, metadata),
    );
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
      user,
    };
  }

  private signAccessToken(user: AuthIdentity): Promise<string> {
    return this.jwt.signAsync({ sub: user.id });
  }

  private newOpaqueToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.refreshPepper).update(token).digest('hex');
  }

  private makeRefreshRecord(
    userId: string,
    rawToken: string,
    familyId: string,
    metadata: RequestMetadata,
  ): RefreshTokenRecordInput {
    return {
      userId,
      ...this.makeReplacementRecord(rawToken, metadata),
      familyId,
    };
  }

  private makeReplacementRecord(
    rawToken: string,
    metadata: RequestMetadata,
  ): Omit<RefreshTokenRecordInput, 'userId' | 'familyId'> {
    return {
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(
        Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
      ),
      userAgent: metadata.userAgent?.slice(0, 1000),
      ipAddress: metadata.ipAddress?.slice(0, 64),
    };
  }
}
