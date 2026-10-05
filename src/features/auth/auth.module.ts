import { Module } from '@nestjs/common';
import { AuthController } from './presentation/http/auth.controller';
import { AuthService } from './application/auth.service';
import { AUTH_REPOSITORY } from './application/auth-repository.port';
import { PrismaAuthRepository } from './infrastructure/persistence/prisma-auth.repository';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaAuthRepository,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
  ],
})
export class AuthModule {}
