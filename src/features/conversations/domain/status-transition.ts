import {
  ConversationStatus,
  UserRole,
} from '../../../core/common/domain-types';

export function canTransitionConversationStatus(
  current: ConversationStatus,
  next: ConversationStatus,
  role: UserRole,
): boolean {
  if (current === next) return true;
  if (current === ConversationStatus.RESOLVED) {
    return next === ConversationStatus.CLOSED && role !== UserRole.AGENT;
  }
  if (current === ConversationStatus.CLOSED) return false;

  const transitions: Partial<
    Record<ConversationStatus, readonly ConversationStatus[]>
  > = {
    [ConversationStatus.ASSIGNED]: [
      ConversationStatus.IN_PROGRESS,
      ConversationStatus.WAITING_CUSTOMER,
      ConversationStatus.RESOLVED,
    ],
    [ConversationStatus.IN_PROGRESS]: [
      ConversationStatus.WAITING_CUSTOMER,
      ConversationStatus.RESOLVED,
    ],
    [ConversationStatus.WAITING_CUSTOMER]: [
      ConversationStatus.IN_PROGRESS,
      ConversationStatus.RESOLVED,
    ],
  };
  return transitions[current]?.includes(next) ?? false;
}
