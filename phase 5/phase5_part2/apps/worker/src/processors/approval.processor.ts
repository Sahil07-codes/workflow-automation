import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../../apps/api/src/common/prisma/prisma.service';

export interface ApprovalJobData {
  applicationId: string;
  userId: string;
}

@Processor('applications:approval')
export class ApprovalProcessor {
  private logger = new Logger(ApprovalProcessor.name);

  constructor(private prisma: PrismaService) {}

  @Process({ name: 'send_approval_email', concurrency: 10 })
  async handleApprovalEmail(job: Job<ApprovalJobData>): Promise<void> {
    const { applicationId, userId } = job.data;

    try {
      this.logger.log(`Processing approval for application: ${applicationId}`);

      // Fetch application and user
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!application || !user) {
        throw new Error('Application or user not found');
      }

      // Update application state
      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          state: 'AWAITING_APPROVAL',
          updatedAt: new Date(),
        },
      });

      // Log event
      await this.prisma.applicationEvent.create({
        data: {
          applicationId,
          fromState: 'PREPARING',
          toState: 'AWAITING_APPROVAL',
          actor: 'SYSTEM',
          meta: { reason: 'Approval email sent' },
        },
      });

      job.progress(100);
      this.logger.log(
        `Approval email processed for application: ${applicationId}`,
      );
    } catch (error) {
      this.logger.error(`Approval processing failed: ${error.message}`);
      throw error;
    }
  }
}
