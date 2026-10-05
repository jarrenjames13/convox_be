import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PresenceStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'agent@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Agent Name' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ writeOnly: true, minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxActiveConversations = 10;
}

export class UpdateAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  fullName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxActiveConversations?: number;
}

export class SetAgentStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class SetPresenceDto {
  @ApiProperty({ enum: PresenceStatus })
  @IsEnum(PresenceStatus)
  presenceStatus!: PresenceStatus;

  @ApiProperty()
  @IsBoolean()
  acceptingConversations!: boolean;
}
