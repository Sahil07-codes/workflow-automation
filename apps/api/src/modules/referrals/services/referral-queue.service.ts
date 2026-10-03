import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const REFERRAL_QUALIFICATION_QUEUE = 'referral-qualification';

@Injectable()
export class ReferralQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('redis_url'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(REFERRAL_QUALIFICATION_QUEUE, {
      connection: this.connection,
    });
  }

  scheduleReward(referralId: string, dueAt: Date): Promise<unknown> {
    const delay = Math.max(0, dueAt.getTime() - Date.now());
    return this.queue.add(
      'reward_qualified_referral',
      { referralId, dueAt: dueAt.toISOString() },
      {
        delay,
        jobId: `referral-reward-${referralId}-${dueAt.getTime()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
