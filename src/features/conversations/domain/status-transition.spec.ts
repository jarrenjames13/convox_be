import { ConversationStatus, UserRole } from '@prisma/client';
import { canTransitionConversationStatus } from './status-transition';

describe('conversation status transitions', () => {
  it('allows agents to move assigned conversations through the supported lifecycle', () => {
    expect(
      canTransitionConversationStatus(
        ConversationStatus.ASSIGNED,
        ConversationStatus.IN_PROGRESS,
        UserRole.AGENT,
      ),
    ).toBe(true);
    expect(
      canTransitionConversationStatus(
        ConversationStatus.WAITING_CUSTOMER,
        ConversationStatus.RESOLVED,
        UserRole.AGENT,
      ),
    ).toBe(true);
  });

  it('does not allow agents to close or reopen resolved conversations', () => {
    expect(
      canTransitionConversationStatus(
        ConversationStatus.RESOLVED,
        ConversationStatus.CLOSED,
        UserRole.AGENT,
      ),
    ).toBe(false);
    expect(
      canTransitionConversationStatus(
        ConversationStatus.RESOLVED,
        ConversationStatus.IN_PROGRESS,
        UserRole.ADMIN,
      ),
    ).toBe(false);
  });

  it('does not allow direct status changes from UNASSIGNED', () => {
    expect(
      canTransitionConversationStatus(
        ConversationStatus.UNASSIGNED,
        ConversationStatus.ASSIGNED,
        UserRole.ADMIN,
      ),
    ).toBe(false);
  });
});
