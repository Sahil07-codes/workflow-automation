import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';

/**
 * JobsModule - read-facing API for job discovery results
 * Phase 4: GET /jobs, GET /jobs/:id, filtering and pagination
 * Phase 5+: apply, submit, state management endpoints
 */
@Module({
  controllers: [JobsController],
  providers: [JobsService, JobsRepository],
  exports: [JobsService],
})
export class JobsModule {}
