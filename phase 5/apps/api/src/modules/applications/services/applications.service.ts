import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ApplicationRepository } from '../repositories/application.repository';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger('ApplicationsService');

  constructor(
    private applicationRepo: ApplicationRepository,
    private prisma: PrismaService,
    @InjectQueue('prepare') private prepareQueue: Queue,
  ) {}

  async startApplication(
    userId: string,
    jobId: string,
    ip: string,
  ) {
    this.logger.log(`Starting application for user ${userId}, job ${jobId}`);

    // Check if job exists
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }

    // Check if application already exists
    const existing = await this.applicationRepo.findByUserAndJob(userId, jobId);
    if (existing) {
      throw new ConflictException('Application already exists for this job');
    }

    // Create application record
    const application = await this.applicationRepo.create({
      userId,
      jobId,
      companyName: job.companyName,
      jobTitle: job.jobTitle,
    });

    // Enqueue form detection job
    await this.prepareQueue.add(
      'detect_form',
      {
        applicationId: application.id,
        userId,
        jobId,
        applyUrl: job.applyUrl,
        jobSource: job.source,
      },
      {
        jobId: application.id,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    // Log event
    await this.applicationRepo.createEvent(
      application.id,
      'APPLICATION_STARTED',
      { ip },
    );

    return application;
  }

  async getApplication(id: string, userId: string) {
    const application = await this.applicationRepo.findById(id);
    
    if (!application || application.userId !== userId) {
      throw new BadRequestException('Application not found');
    }

    return application;
  }

  async listApplications(userId: string, state?: string, limit = 50) {
    return await this.applicationRepo.findByUserId(userId, state, limit);
  }
}
