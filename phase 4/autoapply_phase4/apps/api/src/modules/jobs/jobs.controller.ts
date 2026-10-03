import { Controller, Get, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { jobListQuerySchema, JobListQuery } from '@autoapply/shared/schemas/jobs.schema';
import { JobsService } from './jobs.service';

/**
 * JobsController - read-facing API for job discovery
 * Phase 4: GET /jobs, GET /jobs/:id
 * No apply/submit endpoints (Phase 5)
 */
@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private jobsService: JobsService) {}

  /**
   * GET /jobs - list jobs with filters and pagination
   * Query params: source, status, minMatchScore, location, company, cursor, limit
   */
  @Get()
  @HttpCode(200)
  async listJobs(@CurrentUser() userId: string, @Query() rawQuery: any) {
    // Validate and parse query
    const query = jobListQuerySchema.parse({
      source: rawQuery.source,
      status: rawQuery.status,
      minMatchScore: rawQuery.minMatchScore ? parseInt(rawQuery.minMatchScore, 10) : undefined,
      location: rawQuery.location,
      company: rawQuery.company,
      cursor: rawQuery.cursor,
      limit: rawQuery.limit ? parseInt(rawQuery.limit, 10) : 20,
    });

    return this.jobsService.getJobsForUser(userId, query);
  }

  /**
   * GET /jobs/:id - get a single job by ID
   */
  @Get(':id')
  @HttpCode(200)
  async getJob(@Param('id') jobId: string, @CurrentUser() userId: string) {
    return this.jobsService.getJobById(jobId, userId);
  }

  /**
   * GET /jobs/stats/matching - get matching statistics for the user
   */
  @Get('stats/matching')
  @HttpCode(200)
  async getMatchStats(@CurrentUser() userId: string) {
    return this.jobsService.getMatchStats(userId);
  }
}
