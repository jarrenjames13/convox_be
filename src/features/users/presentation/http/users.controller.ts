import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../../../core/security/current-user.decorator';
import type { AuthenticatedUser } from '../../../../core/security/current-user.decorator';
import { JwtAuthGuard } from '../../../../core/security/jwt-auth.guard';
import {
  Permission,
  RequirePermissions,
} from '../../../../core/security/permissions';
import { PermissionsGuard } from '../../../../core/security/permissions.guard';
import { UsersService } from '../../application/users.service';

export class CreateAdminDto {
  @ApiProperty() @IsEmail() @MaxLength(320) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) fullName!: string;
  @ApiProperty({ writeOnly: true, minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class UpdateAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.UsersManage)
@Controller('v1/users/admins')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list() {
    return this.users.listAdmins();
  }
  @Post() create(
    @Body() dto: CreateAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.createAdmin({ ...dto, actorId: actor.id });
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateAdmin({ id, ...dto, actorId: actor.id });
  }
}
