import type { AuthenticatedUser } from '../../../core/security/current-user.decorator';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export interface UsersRepository {
  listAdmins(): Promise<AuthenticatedUser[]>;
  createAdmin(input: {
    email: string;
    fullName: string;
    passwordHash: string;
    actorId: string;
  }): Promise<AuthenticatedUser>;
  updateAdmin(input: {
    id: string;
    fullName?: string;
    isActive?: boolean;
    actorId: string;
  }): Promise<AuthenticatedUser | null>;
}
