import { GreenhouseAdapter } from './greenhouse.adapter';
import { DiscoveryQuery, NormalizedJob } from '@autoapply/shared';

describe('GreenhouseAdapter', () => {
  let adapter: GreenhouseAdapter;

  beforeEach(() => {
    adapter = new GreenhouseAdapter(['board-token-1', 'board-token-2']);
  });

  describe('parse', () => {
    it('should normalize raw Greenhouse job into NormalizedJob', async () => {
      const rawJob = {
        externalId: '12345',
        source: 'GREENHOUSE',
        title: 'Senior Backend Engineer',
        company: 'TechCorp',
        location: 'Bangalore, India',
        applyUrl: 'https://company.greenhouse.io/jobs/12345',
        canonicalUrl: 'https://company.greenhouse.io/jobs/12345',
        jdText: 'We are looking for a talented engineer...',
        employmentType: 'FULL_TIME',
        publishedDate: new Date('2024-01-15'),
      };

      const result = await adapter.parse(rawJob);

      expect(result.source).toBe('GREENHOUSE');
      expect(result.atsType).toBe('GREENHOUSE');
      expect(result.title).toBe('Senior Backend Engineer');
      expect(result.company).toBe('TechCorp');
      expect(result.status).toBe('OPEN');
      expect(result.contentHash).toBeDefined();
      expect(result.contentHash.length).toBe(64); // SHA-256 hex
    });

    it('should compute consistent content hash', async () => {
      const rawJob = {
        externalId: '12345',
        source: 'GREENHOUSE',
        title: 'Senior Backend Engineer',
        company: 'TechCorp',
        location: 'Bangalore, India',
        applyUrl: 'https://company.greenhouse.io/jobs/12345',
        canonicalUrl: 'https://company.greenhouse.io/jobs/12345',
        jdText: 'Job description text',
      };

      const result1 = await adapter.parse(rawJob);
      const result2 = await adapter.parse(rawJob);

      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should handle missing optional fields', async () => {
      const rawJob = {
        externalId: '12345',
        source: 'GREENHOUSE',
        title: 'Senior Backend Engineer',
        company: 'TechCorp',
        applyUrl: 'https://company.greenhouse.io/jobs/12345',
        canonicalUrl: 'https://company.greenhouse.io/jobs/12345',
      };

      const result = await adapter.parse(rawJob);

      expect(result.location).toBeUndefined();
      expect(result.salaryMin).toBeUndefined();
      expect(result.jdText).toBeUndefined();
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities for Phase 4', () => {
      const caps = adapter.capabilities;

      expect(caps.canApply).toBe(false); // Phase 5+
      expect(caps.needsLogin).toBe(false);
      expect(caps.captchaLikely).toBe(false);
      expect(caps.supportsDiscovery).toBe(true);
    });
  });

  describe('Phase 5 stub methods', () => {
    it('should throw NotImplementedError for detectForm', async () => {
      await expect(adapter.detectForm('https://example.com')).rejects.toThrow(/not implemented/);
    });

    it('should throw NotImplementedError for fill', async () => {
      await expect(adapter.fill('https://example.com', {} as any, {})).rejects.toThrow(/not implemented/);
    });

    it('should throw NotImplementedError for submit', async () => {
      await expect(adapter.submit('https://example.com')).rejects.toThrow(/not implemented/);
    });
  });
});
