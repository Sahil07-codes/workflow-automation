import { BaseAdapter } from '../base.adapter';
import { NormalizedJob, RawJob, DiscoveryQuery } from '@autoapply/shared/schemas/jobs.schema';

interface LeverJob {
  id: string;
  text: string;
  title: string;
  location: {
    name?: string;
  };
  descriptionPlain?: string;
  postingDate: number; // timestamp in ms
  urls: {
    list?: string;
    apply?: string;
  };
  requisitionId?: string;
}

export class LeverAdapter extends BaseAdapter {
  id = 'LEVER';
  name = 'Lever';
  private companyIds: string[];
  private apiBaseUrl = 'https://api.lever.co/v0';

  constructor(companyIds: string[], requestsPerSecond: number = 10, proxyUrl?: string) {
    super(requestsPerSecond, proxyUrl);
    this.companyIds = companyIds;
  }

  async *discover(query: DiscoveryQuery): AsyncIterable<RawJob> {
    for (const companyId of this.companyIds) {
      try {
        const response = await this.fetch(`${this.apiBaseUrl}/postings/${companyId}?mode=json`);
        const data = (await response.json()) as { postings: LeverJob[] };

        for (const job of data.postings || []) {
          // Filter by query if needed
          if (query.locations && job.location?.name && !this.matchesLocations(job.location.name, query.locations)) {
            continue;
          }

          const applyUrl = job.urls.apply || `https://lever.co/careers/${companyId}/apply/${job.id}`;

          yield {
            externalId: job.id,
            source: 'LEVER',
            title: job.title,
            company: companyId,
            location: job.location?.name,
            applyUrl,
            canonicalUrl: job.urls.list || applyUrl,
            jdText: job.descriptionPlain || job.text,
            employmentType: 'FULL_TIME',
            publishedDate: new Date(job.postingDate),
            rawPayload: { lever_id: job.id, company_id: companyId },
          } as RawJob;
        }
      } catch (error) {
        console.error(`Lever adapter error for company ${companyId}:`, error);
        continue;
      }
    }
  }

  async parse(raw: RawJob): Promise<NormalizedJob> {
    return {
      source: raw.source,
      externalId: raw.externalId,
      atsType: 'LEVER',
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
