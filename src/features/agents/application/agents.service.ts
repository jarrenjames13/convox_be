import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PresenceStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { REALTIME_PUBLISHER } from '../../../core/realtime/realtime-publisher.port';
import type { RealtimePublisher } from '../../../core/realtime/realtime-publisher.port';
import { ApplicationException } from '../../../core/common/application.exception';
import { AGENTS_REPOSITORY } from './agents-repository.port';
import type {
  AgentRepository,
  CreateAgentInput,
  UpdateAgentInput,
} from './agents-repository.port';

@Injectable()
export class AgentsService {
  constructor(
    @Inject(AGENTS_REPOSITORY) private readonly repository: AgentRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  list() {
    return this.repository.list();
  }

  async get(id: string) {
    const agent = await this.repository.findById(id);
    if (!agent)
      throw new ApplicationException(
        'AGENT_NOT_FOUND',
        'Agent not found.',
        HttpStatus.NOT_FOUND,
      );
    return agent;
  }

  async create(
    input: Omit<CreateAgentInput, 'passwordHash'> & { password: string },
  ) {
    try {
      return await this.repository.create({
        ...input,
        passwordHash: await argon2.hash(input.password),
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ApplicationException(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(input: UpdateAgentInput) {
    const agent = await this.repository.update(input);
    if (!agent)
      throw new ApplicationException(
        'AGENT_NOT_FOUND',
        'Agent not found.',
        HttpStatus.NOT_FOUND,
      );
    return agent;
  }

  async setActive(input: Parameters<AgentRepository['setActive']>[0]) {
    const agent = await this.repository.setActive(input);
    if (!agent)
      throw new ApplicationException(
        'AGENT_NOT_FOUND',
        'Agent not found.',
        HttpStatus.NOT_FOUND,
      );
    await this.realtime.publishAgentPresenceChanged({
      agentId: agent.userId,
      presenceStatus: agent.presenceStatus,
      acceptingConversations: agent.acceptingConversations,
    });
    return agent;
  }

  async setPresence(input: {
    id: string;
    presenceStatus: PresenceStatus;
    acceptingConversations: boolean;
  }) {
    const agent = await this.repository.setPresence(input);
    if (!agent) {
      throw new ApplicationException(
        'AGENT_NOT_FOUND',
        'Active agent profile not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.realtime.publishAgentPresenceChanged({
      agentId: agent.userId,
      presenceStatus: agent.presenceStatus,
      acceptingConversations: agent.acceptingConversations,
    });
    return agent;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
