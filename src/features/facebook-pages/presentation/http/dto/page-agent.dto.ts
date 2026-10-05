import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AssignPageAgentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentId!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 500,
    description: 'Overrides the agent-wide workload limit.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxActiveConversations?: number;
}
