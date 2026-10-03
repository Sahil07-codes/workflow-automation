import { Injectable } from '@nestjs/common';
import { Prisma, Job, JobMatch } from '@prisma/client';
import { JobListQuery } from '@autoapply/shared';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JobsRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Get paginated jobs for a user, filtered and joined with match scores
   */
  async findJobsForUser(
    userId: string,
    query: JobListQuery,
  ): Promise<{
    jobs: (Job & { matchScore?: number | null; matchReasons?: any | null })[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit || 20;
    const cursor = query.cursor ? { id: query.cursor } : undefined;

    // Build where conditions
    const where: any = {
      status: query.status || 'OPEN',
    };

    if (query.source) {
      where.source = query.source;
    }
    if (query.location) {
      where.location = {
        contains: query.location,
        mode: 'insensitive',
      };
    }
    if (query.company) {
      where.company = {
        contains: query.company,
        mode: 'insensitive',
      };
    }
    if (query.query) {
      where.OR = [
        { title: { contains: query.query, mode: 'insensitive' } },
        { company: { contains: query.query, mode: 'insensitive' } },
        { location: { contains: query.query, mode: 'insensitive' } },
        { jdText: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    // Fetch jobs with optional match data
    const jobs = await this.prisma.job.findMany({
      where,
      cursor,
      take: limit + 1, // Fetch one extra to detect if there are more
      skip: cursor ? 1 : 0,
      orderBy: {
        lastSeen: 'desc',
      },
      include: {
        jobMatches: {
          where: { userId },
          select: {
            matchScore: true,
            matchReasons: true,
          },
        },
      },
    });

    const hasMore = jobs.length > limit;
    const results = jobs.slice(0, limit);

    // Flatten job matches into the job object
    const enrichedJobs = results.map((job) => ({
      ...job,
      matchScore: job.jobMatches[0]?.matchScore ?? null,
      matchReasons: job.jobMatches[0]?.matchReasons ?? null,
    }));

    // Filter by minMatchScore if provided
    let filtered = enrichedJobs;
    if (query.minMatchScore !== undefined) {
      filtered = enrichedJobs.filter((job) => (job.matchScore ?? 0) >= query.minMatchScore!);
    }

    return {
      jobs: filtered,
      cursor: hasMore ? results[results.length - 1].id : null,
      hasMore,
    };
  }

  /**
   * Get a single job by ID with match data
   */
  async findJobById(
    jobId: string,
    userId: string,
  ): Promise<(Job & { matchScore?: number | null; matchReasons?: any | null }) | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        jobMatches: {
          where: { userId },
          select: {
            matchScore: true,
            matchReasons: true,
          },
        },
      },
    });

    if (!job) return null;

    return {
      ...job,
      matchScore: job.jobMatches[0]?.matchScore ?? null,
      matchReasons: job.jobMatches[0]?.matchReasons ?? null,
    };
  }

  /**
   * Get total count of jobs matching filters
   */
  async countJobs(query: Omit<JobListQuery, 'cursor' | 'limit'>): Promise<number> {
    const where: any = {
      status: query.status || 'OPEN',
    };

    if (query.source) {
      where.source = query.source;
    }
    if (query.location) {
      where.location = {
        contains: query.location,
        mode: 'insensitive',
      };
    }
    if (query.company) {
      where.company = {
        contains: query.company,
        mode: 'insensitive',
      };
    }
    if (query.query) {
      where.OR = [
        { title: { contains: query.query, mode: 'insensitive' } },
        { company: { contains: query.query, mode: 'insensitive' } },
        { location: { contains: query.query, mode: 'insensitive' } },
        { jdText: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    return this.prisma.job.count({ where });
  }

  /**
   * Upsert a job match
   */
  async upsertJobMatch(userId: string, jobId: string, matchScore: number, matchReasons?: string[]): Promise<JobMatch> {
    return this.prisma.jobMatch.upsert({
      where: {
        userId_jobId: { userId, jobId },
      },
      create: {
        userId,
        jobId,
        matchScore,
        matchReasons: matchReasons ?? Prisma.JsonNull,
      },
      update: {
        matchScore,
        matchReasons: matchReasons ?? Prisma.JsonNull,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark jobs as closed if they return 404 or other not-found signals
   */
  async markJobClosed(jobId: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'CLOSED',
        lastSeen: new Date(),
      },
    });
  }
}
