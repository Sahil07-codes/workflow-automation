import { BaseAdapter } from '../base.adapter';
import { NormalizedJob, RawJob, DiscoveryQuery } from '@autoapply/shared/schemas/jobs.schema';

interface AshbyJob {
  id: string;
  title: string;
  locationName?: string;
  description?: string;
  companyName: string;
  publishedDate: string;
  isPublished: boolean;
  apply_url?: string;
  url?: string;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

export class AshbyAdapter extends BaseAdapter {
  id = 'ASHBY';
  name = 'Ashby';
  private companyIds: string[];
  private apiBaseUrl = 'https://api.ashbyhq.com/public';

  constructor(companyIds: string[], requestsPerSecond: number = 10, proxyUrl?: string) {
    super(requestsPerSecond, proxyUrl);
    this.companyIds = companyIds;
  }

  async *discover(query: DiscoveryQuery): AsyncIterable<RawJob> {
    for (const companyId of this.companyIds) {
      try {
        const response = await this.fetch(`${this.apiBaseUrl}/jobs?companyId=${companyId}`);
        const data = (await response.json()) as AshbyResponse;

        for (const job of data.jobs || []) {
          if (!job.isPublished) continue;

          // Filter by query if needed
          if (
            query.locations &&
            job.locationName &&
            !this.matchesLocations(job.locationName, query.locations)
          ) {
            continue;
          }

          const applyUrl = job.apply_url || job.url || `https://apply.ashbyhq.com/${companyId}/${job.id}`;

          yield {
            externalId: job.id,
            source: 'ASHBY',
            title: job.title,
            company: job.companyName,
            location: job.locationName,
            applyUrl,
            canonicalUrl: job.url || applyUrl,
            jdText: job.description,
            employmentType: 'FULL_TIME',
            publishedDate: new Date(job.publishedDate),
            rawPayload: { ashby_id: job.id, company_id: companyId },
          } as RawJob;
        }
      } catch (error) {
        console.error(`Ashby adapter error for company ${companyId}:`, error);
        continue;
      }
    }
  }

  async parse(raw: RawJob): Promise<NormalizedJob> {
    return {
      source: raw.source,
      externalId: raw.externalId,
      atsType: 'ASHBY',
      title: raw.title,
      company: raw.company,
      location: raw.location,
      applyUrl: raw.applyUrl,
      canonicalUrl: raw.canonicalUrl,
      jdText: raw.jdText,
      employmentType: raw.employmentType || 'FULL_TIME',
      contentHash: this.computeHash(raw.jdText || raw.title),
      status: 'OPEN',
      firstSeen: raw.publishedDate || new Date(),
      lastSeen: new Date(),
      rawData: raw.rawPayload,
    };
  }

  private matchesLocations(jobLocation: string, queryLocations: string[]): boolean {
    const normalized = this.normalizeText(jobLocation);
    return queryLocations.some((loc) => this.normalizeText(loc) === normalized || normalized.includes(this.normalizeText(loc)));
  }
}
