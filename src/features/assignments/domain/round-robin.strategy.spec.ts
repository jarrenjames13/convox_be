import {
  RoundRobinCandidate,
  selectRoundRobinAgent,
} from './round-robin.strategy';

const candidate = (
  agentId: string,
  overrides: Partial<RoundRobinCandidate> = {},
): RoundRobinCandidate => ({
  agentId,
  isActive: true,
  isAgent: true,
  isPageMember: true,
  membershipEnabled: true,
  acceptingConversations: true,
  activeWorkload: 0,
  maxActiveConversations: 5,
  ...overrides,
});

describe('selectRoundRobinAgent', () => {
  it('selects in stable round-robin order after the durable cursor', () => {
    const agents = [
      candidate('agent-c'),
      candidate('agent-a'),
      candidate('agent-b'),
    ];
    expect(selectRoundRobinAgent(agents, null)?.agentId).toBe('agent-a');
    expect(selectRoundRobinAgent(agents, 'agent-a')?.agentId).toBe('agent-b');
    expect(selectRoundRobinAgent(agents, 'agent-c')?.agentId).toBe('agent-a');
  });

  it.each([
    ['disabled user', { isActive: false }],
    ['wrong role', { isAgent: false }],
    ['not a Page member', { isPageMember: false }],
    ['disabled Page membership', { membershipEnabled: false }],
    ['not accepting conversations', { acceptingConversations: false }],
    ['at the workload limit', { activeWorkload: 5, maxActiveConversations: 5 }],
  ])('skips an ineligible candidate (%s)', (_label, override) => {
    const selected = selectRoundRobinAgent(
      [candidate('agent-a', override), candidate('agent-b')],
      null,
    );
    expect(selected?.agentId).toBe('agent-b');
  });

  it('returns no agent when all candidates are ineligible', () => {
    expect(
      selectRoundRobinAgent(
        [candidate('agent-a', { acceptingConversations: false })],
        null,
      ),
    ).toBeNull();
  });

  it('starts at the first agent if the cursor points to an absent agent', () => {
    expect(
      selectRoundRobinAgent(
        [candidate('agent-b'), candidate('agent-a')],
        'removed-agent',
      )?.agentId,
    ).toBe('agent-a');
  });
});
