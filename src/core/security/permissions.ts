import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const PERMISSIONS_KEY = 'convox:permissions';

export enum Permission {
  UsersManage = 'users:manage',
  AgentsManage = 'agents:manage',
  AgentsRead = 'agents:read',
  PagesManage = 'pages:manage',
  ConversationsViewAll = 'conversations:view_all',
  ConversationsAssign = 'conversations:assign',
  AnalyticsView = 'analytics:view',
  SystemManage = 'system:manage',
}

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(Object.values(Permission)),
  ADMIN: new Set([
    Permission.AgentsManage,
    Permission.AgentsRead,
    Permission.PagesManage,
    Permission.ConversationsViewAll,
    Permission.ConversationsAssign,
    Permission.AnalyticsView,
  ]),
  AGENT: new Set(),
};

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
