import { Injectable, NotFoundException } from '@nestjs/common';
import { JobListQuery, JobResponse, JobsPaginatedResponse } from '@autoapply/shared';
import { JobsRepository } from './jobs.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JobsService {
  constructor(private jobsRepository: JobsRepository, private prisma: PrismaService) {}

  /**
   * Get paginated list of jobs for the current user
   * Filters by user preferences (min_match_score from job_preferences)
   */
  async getJobsForUser(userId: string, query: JobListQuery): Promise<JobsPaginatedResponse> {
    // Validate user exists and get their preferences
    const userPrefs = await this.prisma.jobPreferences.findUnique({
      where: { user_id: userId },
    });

    if (!userPrefs) {
      throw new NotFoundException('User preferences not found');
    }

    // Apply min_match_score from user preferences
    const effectiveMinScore = query.minMatchScore ?? userPrefs.min_match_score;

    // Fetch jobs
    const { jobs, cursor, hasMore } = await this.jobsRepository.findJobsForUser(userId, query);

    // Filter by min_match_score
    const filteredJobs = jobs.filter((job) => {
      const score = job.matchScore ?? 0;
      return score >= effectiveMinScore;
    });

    // Get total count
    const total = await this.jobsRepository.countJobs({
      status: query.status,
      source: query.source,
      location: query.location,
      company: query.company,
    });

    // Transform to response schema
    const data: JobResponse[] = filteredJobs.map((job) => ({
      id: job.id,
      source: job.source,
      externalId: job.externalId,
      company: job.company,
      title: job.title,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      applyUrl: job.applyUrl,
      canonicalUrl: job.canonicalUrl,
      matchScore: job.matchScore ?? null,
      matchReasons: Array.isArray(job.matchReasons) ? job.matchReasons as string[] : null,
      status: job.status as any,
      firstSeen: job.firstSeen,
      lastSeen: job.lastSeen,
    }));

    return {
      data,
      cursor,
      hasMore,
      total,
    };
  }

  /**
   * Get a single job by ID
   */
  async getJobById(jobId: string, userId: string): Promise<JobResponse> {
    const job = await this.jobsRepository.findJobById(jobId, userId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return {
      id: job.id,
      source: job.source,
      externalId: job.externalId,
      company: job.company,
      title: job.title,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      applyUrl: job.applyUrl,
      canonicalUrl: job.canonicalUrl,
      matchScore: job.matchScore ?? null,
      matchReasons: Array.isArray(job.matchReasons) ? job.matchReasons as string[] : null,
      status: job.status as any,
      firstSeen: job.firstSeen,
      lastSeen: job.lastSeen,
    };
  }

  /**
   * Get matching statistics for a user
   */
  async getMatchStats(userId: string): Promise<{
    totalJobs: number;
    matchedJobs: number;
    averageScore: number;
    scoreDistribution: { range: string; count: number }[];
  }> {
    const matches = await this.prisma.jobMatch.findMany({
      where: { userId },
      select: { matchScore: true },
    });

    const scores = matches.map((m) => m.matchScore);

    if (scores.length === 0) {
      return {
        totalJobs: 0,
        matchedJobs: 0,
        averageScore: 0,
        scoreDistribution: [],
      };
    }

    const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Distribution buckets
    const distribution = {
      '0-25': scores.filter((s) => s <= 25).length,
      '26-50': scores.filter((s) => s > 25 && s <= 50).length,
      '51-75': scores.filter((s) => s > 50 && s <= 75).length,
      '76-100': scores.filter((s) => s > 75).length,
    };

    return {
      totalJobs: await this.jobsRepository.countJobs({}),
      matchedJobs: matches.length,
      averageScore,
      scoreDistribution: Object.entries(distribution).map(([range, count]) => ({
        range,
        count,
      })),
    };
  }
}
