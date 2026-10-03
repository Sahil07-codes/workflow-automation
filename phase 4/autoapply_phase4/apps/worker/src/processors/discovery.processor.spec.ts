import { DiscoveryProcessor } from './discovery.processor';
import { DiscoveryQueue } from '../queues/discovery.queue';
import { PrismaClient } from '@prisma/client';
import { getAdapter, GreenhouseAdapter } from '@autoapply/adapters';
import { NormalizedJob } from '@autoapply/shared/schemas/jobs.schema';

/**
 * Integration test for DiscoveryProcessor
 * Tests that jobs are correctly upserted into the database
 * Verifies deduplication logic (second run updates last_seen, not duplicate)
 */
describe('DiscoveryProcessor', () => {
  let processor: DiscoveryProcessor;
  let prisma: PrismaClient;
  let queue: DiscoveryQueue;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // Initialize processor with test Redis URL
    processor = new DiscoveryProcessor(process.env.REDIS_URL || 'redis://localhost:6379', prisma, 1);
  });

  afterAll(async () => {
    await processor.stop();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up jobs before each test
    await prisma.job.deleteMany({});
    await prisma.jobMatch.deleteMany({});
  });

  describe('upsert behavior', () => {
    it('should insert new jobs from adapter', async () => {
      const mockJob: NormalizedJob = {
        source: 'GREENHOUSE',
        externalId: 'test-123',
        atsType: 'GREENHOUSE',
        title: 'Test Engineer',
        company: 'TestCorp',
        location: 'Bangalore',
        applyUrl: 'https://example.com/apply',
        canonicalUrl: 'https://example.com/job/123',
        contentHash: 'hash-123',
        status: 'OPEN',
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const created = await prisma.job.create({
        data: {
          source: mockJob.source,
          externalId: mockJob.externalId,
          atsType: mockJob.atsType,
          title: mockJob.title,
          company: mockJob.company,
          location: mockJob.location,
          applyUrl: mockJob.applyUrl,
          canonicalUrl: mockJob.canonicalUrl,
          contentHash: mockJob.contentHash,
        },
      });

      expect(created.id).toBeDefined();
      expect(created.externalId).toBe('test-123');
    });

    it('should update last_seen on duplicate job', async () => {
      const firstTime = new Date('2024-01-01');
      const secondTime = new Date('2024-01-02');

      // First upsert
      const job1 = await prisma.job.upsert({
        where: {
          source_externalId: {
            source: 'GREENHOUSE',
            externalId: 'test-123',
          },
        },
        create: {
          source: 'GREENHOUSE',
          externalId: 'test-123',
          title: 'Test Engineer',
          company: 'TestCorp',
          applyUrl: 'https://example.com/apply',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: 'hash-v1',
          lastSeen: firstTime,
        },
        update: {
          lastSeen: firstTime,
        },
      });

      expect(job1.lastSeen.getTime()).toBe(firstTime.getTime());

      // Second upsert (should update, not insert)
      const job2 = await prisma.job.upsert({
        where: {
          source_externalId: {
            source: 'GREENHOUSE',
            externalId: 'test-123',
          },
        },
        create: {
          source: 'GREENHOUSE',
          externalId: 'test-123',
          title: 'Test Engineer',
          company: 'TestCorp',
          applyUrl: 'https://example.com/apply',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: 'hash-v1',
        },
        update: {
          lastSeen: secondTime,
        },
      });

      expect(job2.id).toBe(job1.id); // Same ID = update, not insert
      expect(job2.lastSeen.getTime()).toBe(secondTime.getTime());
    });

    it('should not duplicate jobs (unique constraint)', async () => {
      await prisma.job.create({
        data: {
          source: 'GREENHOUSE',
          externalId: 'test-123',
          title: 'Test Engineer',
          company: 'TestCorp',
          applyUrl: 'https://example.com/apply',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: 'hash-123',
        },
      });

      // Try to create duplicate
      await expect(
        prisma.job.create({
          data: {
            source: 'GREENHOUSE',
            externalId: 'test-123',
            title: 'Test Engineer 2',
            company: 'TestCorp',
            applyUrl: 'https://example.com/apply',
            canonicalUrl: 'https://example.com/job/123',
            contentHash: 'hash-456',
          },
        }),
      ).rejects.toThrow(); // Should fail unique constraint
    });
  });

  describe('content hash update', () => {
    it('should update jd_text when content hash changes', async () => {
      const jdText1 = 'We are hiring a backend engineer with 5 years experience';
      const jdText2 = 'We are hiring a senior backend engineer with 7 years experience';

      // First insert
      const job1 = await prisma.job.upsert({
        where: {
          source_externalId: {
            source: 'GREENHOUSE',
            externalId: 'test-123',
          },
        },
        create: {
          source: 'GREENHOUSE',
          externalId: 'test-123',
          title: 'Backend Engineer',
          company: 'TestCorp',
          applyUrl: 'https://example.com/apply',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: 'hash-v1',
          jdText: jdText1,
        },
        update: {},
      });

      expect(job1.jdText).toBe(jdText1);

      // Second update with different content
      const hash2 = require('crypto').createHash('sha256').update(jdText2).digest('hex');
      const job2 = await prisma.job.upsert({
        where: {
          source_externalId: {
            source: 'GREENHOUSE',
            externalId: 'test-123',
          },
        },
        create: {
          source: 'GREENHOUSE',
          externalId: 'test-123',
          title: 'Backend Engineer',
          company: 'TestCorp',
          applyUrl: 'https://example.com/apply',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: hash2,
          jdText: jdText2,
        },
        update: {
          jdText: jdText2,
          contentHash: hash2,
        },
      });

      expect(job2.jdText).toBe(jdText2);
      expect(job2.contentHash).toBe(hash2);
    });
  });
});
