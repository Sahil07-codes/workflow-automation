import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { listAdapters } from '@autoapply/adapters';

/**
 * DiscoverySweepScheduler - schedules periodic job discovery sweeps
 * Enqueues discovery jobs for all configured adapters on a schedule
 * Also enqueues matching jobs for users whose preferences match new jobs
 */
export class DiscoverySweepScheduler {
  private schedulerQueue: Queue;
  private connection: Redis;
  private prisma: PrismaClient;
  private sweepIntervalHours: number;
  private isRunning: boolean = false;

  constructor(redisUrl: string, prisma: PrismaClient, sweepIntervalHours: number = 4) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.schedulerQueue = new Queue('discovery-scheduler', {
      connection: this.connection,
    });
    this.prisma = prisma;
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

    // Also run immediately on startup
    setTimeout(() => this.triggerSweep(), 5000);
  }

  /**
   * Manually trigger a discovery sweep
   */
  async triggerSweep(): Promise<void> {
    console.log('Triggering discovery sweep...');

    const adapterIds = listAdapters().map((a) => a.id);

    if (adapterIds.length === 0) {
      console.warn('No adapters configured for discovery');
      return;
    }

    // Enqueue discovery jobs for each adapter
    for (const adapterId of adapterIds) {
      try {
        // Create the discovery job
        const discoveryQueue = new Queue('discovery', { connection: this.connection });
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

    await this.schedulerQueue.close();
    await this.connection.quit();

    console.log('Discovery sweep scheduler stopped');
  }
}

/**
 * Factory function
 */
export function createDiscoverySweepScheduler(redisUrl: string, prisma: PrismaClient, sweepIntervalHours?: number): DiscoverySweepScheduler {
  return new DiscoverySweepScheduler(redisUrl, prisma, sweepIntervalHours);
}
