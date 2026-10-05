import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ApplicationException } from '../../../core/common/application.exception';
import { USERS_REPOSITORY } from './users-repository.port';
import type { UsersRepository } from './users-repository.port';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repository: UsersRepository,
  ) {}
  listAdmins() {
    return this.repository.listAdmins();
  }
  async createAdmin(input: {
    email: string;
    fullName: string;
    password: string;
    actorId: string;
  }) {
    try {
      return await this.repository.createAdmin({
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName,
        passwordHash: await argon2.hash(input.password),
        actorId: input.actorId,
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ApplicationException(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      throw error;
    }
  }
  async updateAdmin(input: {
    id: string;
    fullName?: string;
    isActive?: boolean;
    actorId: string;
  }) {
    const admin = await this.repository.updateAdmin(input);
    if (!admin)
      throw new ApplicationException(
        'USER_NOT_FOUND',
        'Admin account not found.',
        HttpStatus.NOT_FOUND,
      );
    return admin;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === 'P2002';
}
