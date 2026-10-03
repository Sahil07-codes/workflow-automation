import { Queue } from 'bullmq';
import Redis from 'ioredis';

export interface DiscoveryJobData {
  adapterId: string;
  params?: {
    roles?: string[];
    locations?: string[];
    minSalary?: number;
  };
  retryCount?: number;
}

/**
 * Discovery Queue - BullMQ queue for job discovery tasks
 * Each adapter gets its own discovery job scheduled periodically
 * Supports rate limiting per adapter to avoid API throttling
 */
export class DiscoveryQueue {
  private queue: Queue<DiscoveryJobData>;
  private connection: Redis;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<DiscoveryJobData>('discovery', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Remove completed jobs after 1 hour
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });
  }

  /**
   * Enqueue a discovery job for a specific adapter
   */
  async enqueueDiscovery(adapterId: string, params?: DiscoveryJobData['params']): Promise<string> {
    const job = await this.queue.add(
      `discover-${adapterId}`,
      {
        adapterId,
        params,
      },
      {
        jobId: `discovery-${adapterId}-${Date.now()}`,
      },
    );
    return job.id || '';
  }

  /**
   * Enqueue discovery sweep for all configured adapters
   */
  async enqueueSweep(adapterIds: string[]): Promise<string[]> {
    const jobIds: string[] = [];
    for (const adapterId of adapterIds) {
      const jobId = await this.enqueueDiscovery(adapterId);
      jobIds.push(jobId);
    }
    return jobIds;
  }

  /**
   * Get queue depth (number of pending jobs)
   */
  async getQueueDepth(): Promise<number> {
    return this.queue.count();
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get the underlying Queue instance for processors
   */
  getUnderlyingQueue(): Queue<DiscoveryJobData> {
    return this.queue;
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

/**
 * Factory function to create discovery queue
 */
export function createDiscoveryQueue(redisUrl: string): DiscoveryQueue {
  return new DiscoveryQueue(redisUrl);
}
