import { Module } from '@nestjs/common';
import { USERS_REPOSITORY } from './application/users-repository.port';
import { UsersService } from './application/users.service';
import { PrismaUsersRepository } from './infrastructure/persistence/prisma-users.repository';
import { UsersController } from './presentation/http/users.controller';
@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaUsersRepository,
    { provide: USERS_REPOSITORY, useExisting: PrismaUsersRepository },
  ],
})
export class UsersModule {}
