import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const APPLICATION_PREPARE_QUEUE = 'application-prepare';
export const APPLICATION_SUBMIT_QUEUE = 'application-submit';

@Injectable()
export class ApplicationQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly prepareQueue: Queue;
  private readonly submitQueue: Queue;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('redis_url'), {
      maxRetriesPerRequest: null,
    });
    this.prepareQueue = new Queue(APPLICATION_PREPARE_QUEUE, {
      connection: this.connection,
    });
    this.submitQueue = new Queue(APPLICATION_SUBMIT_QUEUE, {
      connection: this.connection,
    });
  }

  enqueuePreparation(applicationId: string): Promise<unknown> {
    return this.prepareQueue.add(
      'prepare_application',
      { applicationId },
      {
        jobId: `prepare-${applicationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );
  }

  enqueueSubmission(applicationId: string): Promise<unknown> {
    return this.submitQueue.add(
      'submit_application',
      { applicationId },
      { jobId: `submit-${applicationId}`, removeOnComplete: 500, removeOnFail: 500 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prepareQueue.close(), this.submitQueue.close()]);
    await this.connection.quit();
  }
}
