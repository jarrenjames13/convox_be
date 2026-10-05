export interface RoundRobinCandidate {
  agentId: string;
  isActive: boolean;
  isAgent: boolean;
  isPageMember: boolean;
  membershipEnabled: boolean;
  acceptingConversations: boolean;
  activeWorkload: number;
  maxActiveConversations: number;
}

export function selectRoundRobinAgent(
  candidates: readonly RoundRobinCandidate[],
  lastAssignedAgentId: string | null,
): RoundRobinCandidate | null {
  if (candidates.length === 0) return null;
  const ordered = [...candidates].sort((left, right) =>
    left.agentId.localeCompare(right.agentId),
  );
  const start = ordered.findIndex(
    (candidate) => candidate.agentId === lastAssignedAgentId,
  );

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(start + offset) % ordered.length];
    const eligible =
      candidate.isActive &&
      candidate.isAgent &&
      candidate.isPageMember &&
      candidate.membershipEnabled &&
      candidate.acceptingConversations &&
      candidate.activeWorkload < candidate.maxActiveConversations;
    if (eligible) return candidate;
  }

  return null;
}
