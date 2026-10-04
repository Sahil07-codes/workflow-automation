import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';
import { PrismaService } from '../../database/prisma.service';
import { DayOneModule } from '../day-one/day-one.module';

/**
 * JobsModule - read-facing API for job discovery results
 * Phase 4: GET /jobs, GET /jobs/:id, filtering and pagination
 * Phase 5+: apply, submit, state management endpoints
 */
@Module({
  imports: [DayOneModule],
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, PrismaService],
  exports: [JobsService],
})
export class JobsModule {}
