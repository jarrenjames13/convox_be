import { Module } from '@nestjs/common';
import { ASSIGNMENT_REPOSITORY } from './application/assignment-repository.port';
import { AssignmentsService } from './application/assignments.service';
import { PrismaAssignmentRepository } from './infrastructure/persistence/prisma-assignment.repository';

@Module({
  providers: [
    AssignmentsService,
    PrismaAssignmentRepository,
    { provide: ASSIGNMENT_REPOSITORY, useExisting: PrismaAssignmentRepository },
  ],
  exports: [AssignmentsService, PrismaAssignmentRepository],
})
export class AssignmentsModule {}
