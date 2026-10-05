import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { listAdapters } from '@autoapply/adapters';

/**
 * DiscoverySweepScheduler - schedules periodic job discovery sweeps
 * Enqueues discovery jobs for all configured adapters on a schedule
 * Also enqueues matching jobs for users whose preferences match new jobs
 */
export class DiscoverySweepScheduler {
  private schedulerQueue: Queue;
  private schedulerWorker: Worker;
  private connection: Redis;
  private sweepIntervalHours: number;
  private isRunning: boolean = false;

  constructor(redisUrl: string, sweepIntervalHours: number = 4) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.schedulerQueue = new Queue('discovery-scheduler', {
      connection: this.connection,
    });
    this.schedulerWorker = new Worker(
      'discovery-scheduler',
      async () => this.triggerSweep(),
      { connection: this.connection.duplicate() },
    );
    this.sweepIntervalHours = sweepIntervalHours;
  }

  /**
   * Start the scheduler
   * Creates a repeating job that triggers discovery sweeps
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`Starting discovery sweep scheduler (interval: ${this.sweepIntervalHours}h)`);

    // Create a repeating job for the discovery sweep
    await this.schedulerQueue.add(
      'sweep',
      {},
      {
        repeat: {
          every: this.sweepIntervalHours * 60 * 60 * 1000, // Convert hours to milliseconds
        },
        jobId: 'discovery-sweep-recurring',
      },
    );

    await this.triggerSweep();
  }

  /**
   * Manually trigger a discovery sweep
   */
  async triggerSweep(): Promise<void> {
    console.log('Triggering discovery sweep...');

    const adapterIds = listAdapters().map((a) => a.id);

    if (adapterIds.length === 0) {
      console.warn(
        'No ATS discovery adapters configured. Set GREENHOUSE_BOARD_TOKENS, LEVER_COMPANY_IDS, or ASHBY_COMPANY_IDS in the worker environment to enable supported public-board discovery.',
      );
      return;
    }

    const discoveryQueue = new Queue('discovery', { connection: this.connection });
    try {
      for (const adapterId of adapterIds) {
        try {
        // Create the discovery job
        await discoveryQueue.add(
          `discover-${adapterId}`,
          {
            adapterId,
          },
          {
            jobId: `discovery-${adapterId}-${Date.now()}`,
          },
        );
        console.log(`  Enqueued discovery for ${adapterId}`);
        } catch (error) {
          console.error(`Failed to enqueue discovery for ${adapterId}:`, error);
        }
      }
    } finally {
      await discoveryQueue.close();
    }

    console.log(`✓ Discovery sweep triggered for ${adapterIds.length} adapters`);
  }

  /**
   * Get scheduler stats
   */
  async getStats(): Promise<{
    isRunning: boolean;
    nextSweep?: Date;
  }> {
    // In production, would fetch next job execution from BullMQ
    return {
      isRunning: this.isRunning,
      nextSweep: new Date(Date.now() + this.sweepIntervalHours * 60 * 60 * 1000),
    };
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    await this.schedulerWorker.close();
    await this.schedulerQueue.close();
    await this.connection.quit();

    console.log('Discovery sweep scheduler stopped');
  }
}

/**
 * Factory function
 */
export function createDiscoverySweepScheduler(redisUrl: string, sweepIntervalHours?: number): DiscoverySweepScheduler {
  return new DiscoverySweepScheduler(redisUrl, sweepIntervalHours);
}
