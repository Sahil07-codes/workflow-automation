import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Prisma, PrismaClient } from '@prisma/client';
import { getAdapter } from '@autoapply/adapters';
import { DiscoveryJobData } from '../queues/discovery.queue';

/**
 * DiscoveryProcessor - processes discovery jobs from BullMQ queue
 * Calls adapter.discover() and adapter.parse(), then upserts jobs into DB
 * Handles deduplication using (source, externalId) unique constraint
 */
export class DiscoveryProcessor {
  private worker: Worker<DiscoveryJobData>;
  private prisma: PrismaClient;
  private connection: Redis;

  constructor(redisUrl: string, prisma: PrismaClient, concurrency: number = 5) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.prisma = prisma;

    this.worker = new Worker<DiscoveryJobData>(
      'discovery',
      async (job: Job<DiscoveryJobData>) => {
        return this.processDiscoveryJob(job);
      },
      {
        connection: this.connection,
        concurrency,
      },
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`✓ Discovery job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`✗ Discovery job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });
  }

  /**
   * Process a single discovery job
   */
  private async processDiscoveryJob(job: Job<DiscoveryJobData>): Promise<{ jobsDiscovered: number; jobsUpserted: number }> {
    const { adapterId, params } = job.data;

    console.log(`Processing discovery for adapter: ${adapterId}`);

    const adapter = getAdapter(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }

    let jobsDiscovered = 0;
    let jobsUpserted = 0;

    try {
      // Stream jobs from adapter discovery
      for await (const rawJob of adapter.discover(params || {})) {
        jobsDiscovered++;

        try {
          // Parse and normalize the raw job
          const normalized = await adapter.parse(rawJob);

          // Upsert into database
          await this.prisma.job.upsert({
            where: {
              source_externalId: {
                source: normalized.source,
                externalId: normalized.externalId,
              },
            },
            create: {
              source: normalized.source,
              externalId: normalized.externalId,
              atsType: normalized.atsType,
              applyUrl: normalized.applyUrl,
              canonicalUrl: normalized.canonicalUrl,
              company: normalized.company,
              title: normalized.title,
              location: normalized.location,
              salaryMin: normalized.salaryMin,
              salaryMax: normalized.salaryMax,
              employmentType: normalized.employmentType,
              jdText: normalized.jdText,
              contentHash: normalized.contentHash,
              status: normalized.status as any,
              firstSeen: normalized.firstSeen,
              lastSeen: normalized.lastSeen,
              rawData: normalized.rawData ?? Prisma.DbNull,
            },
            update: {
              lastSeen: new Date(),
              status: normalized.status as any,
              // Only update JD if content changed
              ...(normalized.contentHash !== (rawJob.rawPayload?.contentHash || '') && {
                jdText: normalized.jdText,
                contentHash: normalized.contentHash,
              }),
            },
          });

          jobsUpserted++;

          // Report progress every 100 jobs
          if (jobsDiscovered % 100 === 0) {
            job.updateProgress((jobsDiscovered / 1000) * 100); // Assume ~1000 jobs per sweep
            console.log(`  ...processed ${jobsDiscovered} jobs for ${adapterId}`);
          }
        } catch (error) {
          console.error(`Failed to process individual job from ${adapterId}:`, error);
          // Continue with next job
        }
      }

      console.log(`✓ Discovery complete for ${adapterId}: ${jobsDiscovered} discovered, ${jobsUpserted} upserted`);

      return { jobsDiscovered, jobsUpserted };
    } catch (error) {
      console.error(`✗ Discovery failed for ${adapterId}:`, error);
      throw error;
    }
  }

  /**
   * Start the processor
   */
  async start(): Promise<void> {
    console.log('Discovery processor started');
  }

  /**
   * Stop the processor gracefully
   */
  async stop(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
    console.log('Discovery processor stopped');
  }
}

/**
 * Factory function
 */
export function createDiscoveryProcessor(redisUrl: string, prisma: PrismaClient, concurrency?: number): DiscoveryProcessor {
  return new DiscoveryProcessor(redisUrl, prisma, concurrency);
}
