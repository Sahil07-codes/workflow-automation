import { Controller, Get, Param, Query, HttpCode } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { jobListQuerySchema } from '@autoapply/shared';
import { JobsService } from './jobs.service';
import { DayOneService } from '../day-one/day-one.service';

/**
 * JobsController - read-facing API for job discovery
 * Phase 4: GET /jobs, GET /jobs/:id
 * No apply/submit endpoints (Phase 5)
 */
@Controller('jobs')
export class JobsController {
  constructor(
    private jobsService: JobsService,
    private readonly dayOne: DayOneService,
  ) {}

  /**
   * GET /jobs - list jobs with filters and pagination
   * Query params: source, status, minMatchScore, location, company, cursor, limit
   */
  @Get()
  @HttpCode(200)
  async listJobs(@CurrentUser() user: { id: string }, @Query() rawQuery: any) {
    return this.jobsService.getJobsForUser(user.id, this.parseListQuery(rawQuery));
  }

  /**
   * GET /jobs/recommended - list open jobs meeting the user's match-score preference
   */
  @Get('recommended')
  @HttpCode(200)
  async getRecommendedJobs(
    @CurrentUser() user: { id: string },
    @Query() rawQuery: any,
  ) {
    return this.jobsService.getJobsForUser(
      user.id,
      this.parseListQuery({ ...rawQuery, status: 'OPEN' }),
    );
  }

  /**
   * GET /jobs/search?query=... - search open jobs by title, company, location, or description
   */
  @Get('search')
  @HttpCode(200)
  async searchJobs(@CurrentUser() user: { id: string }, @Query() rawQuery: any) {
    return this.jobsService.getJobsForUser(
      user.id,
      this.parseListQuery({ ...rawQuery, status: 'OPEN' }),
    );
  }

  @Get('intakes')
  @HttpCode(200)
  async listJobIntakes(@CurrentUser() user: { id: string }) {
    return this.dayOne.listJobIntakes(user.id);
  }

  /**
   * GET /jobs/:id - get a single job by ID
   */
  @Get(':id')
  @HttpCode(200)
  async getJob(@Param('id') jobId: string, @CurrentUser() user: { id: string }) {
    return this.jobsService.getJobById(jobId, user.id);
  }

  /**
   * GET /jobs/stats/matching - get matching statistics for the user
   */
  @Get('stats/matching')
  @HttpCode(200)
  async getMatchStats(@CurrentUser() user: { id: string }) {
    return this.jobsService.getMatchStats(user.id);
  }

  private parseListQuery(rawQuery: any) {
    return jobListQuerySchema.parse({
      source: rawQuery.source,
      status: rawQuery.status,
      minMatchScore: rawQuery.minMatchScore
        ? parseInt(rawQuery.minMatchScore, 10)
        : undefined,
      location: rawQuery.location,
      company: rawQuery.company,
      query: rawQuery.query,
      cursor: rawQuery.cursor,
      limit: rawQuery.limit ? parseInt(rawQuery.limit, 10) : 20,
    });
  }
}
