import { BaseAdapter } from '../base.adapter';
import { NormalizedJob, RawJob, DiscoveryQuery } from '@autoapply/shared';

interface GreenhouseJob {
  id: number;
  title: string;
  location: {
    name?: string;
  };
  departments?: Array<{ name: string }>;
  absolute_url: string;
  internal_job_id?: string;
}

interface GreenhouseJobDetail {
  id: number;
  title: string;
  content: string; // JD text
  location: { name?: string };
  absolute_url: string;
  updated_at: string;
}

export class GreenhouseAdapter extends BaseAdapter {
  id = 'GREENHOUSE';
  name = 'Greenhouse';
  private boardTokens: string[];
  private apiBaseUrl = 'https://boards-api.greenhouse.io';

  constructor(boardTokens: string[], requestsPerSecond: number = 10, proxyUrl?: string) {
    super(requestsPerSecond, proxyUrl);
    this.boardTokens = boardTokens;
  }

  async *discover(query: DiscoveryQuery): AsyncIterable<RawJob> {
    for (const token of this.boardTokens) {
      try {
        const response = await this.fetch(`${this.apiBaseUrl}/v1/boards/${token}/jobs`);
        const data = (await response.json()) as { jobs: GreenhouseJob[] };

        for (const job of data.jobs || []) {
          // Filter by query if needed
          if (query.locations && job.location?.name && !this.matchesLocations(job.location.name, query.locations)) {
            continue;
          }

          // Fetch full job details for JD text
          const detail = await this.fetchJobDetail(token, job.id);
          if (!detail) continue;

          yield {
            externalId: String(job.id),
            source: 'GREENHOUSE',
            title: job.title,
            company: this.extractCompanyFromUrl(job.absolute_url),
            location: job.location?.name,
            applyUrl: job.absolute_url,
            canonicalUrl: job.absolute_url,
            jdText: detail.content,
            employmentType: 'FULL_TIME',
            publishedDate: new Date(detail.updated_at),
            rawPayload: { greenhouse_id: job.id, board_token: token },
          } as RawJob;
        }
      } catch (error) {
        console.error(`Greenhouse adapter error for token ${token}:`, error);
        continue;
      }
    }
  }

  async parse(raw: RawJob): Promise<NormalizedJob> {
    return {
      source: raw.source,
      externalId: raw.externalId,
      atsType: 'GREENHOUSE',
      title: raw.title,
      company: raw.company,
      location: raw.location,
      applyUrl: raw.applyUrl,
      canonicalUrl: raw.canonicalUrl,
      jdText: raw.jdText,
      employmentType: 'FULL_TIME',
      contentHash: this.computeHash(raw.jdText || raw.title),
      status: 'OPEN',
      firstSeen: raw.publishedDate || new Date(),
      lastSeen: new Date(),
      rawData: raw.rawPayload,
    };
  }

  private async fetchJobDetail(token: string, jobId: number): Promise<GreenhouseJobDetail | null> {
    try {
      const response = await this.fetch(`${this.apiBaseUrl}/v1/boards/${token}/jobs/${jobId}`);
      return (await response.json()) as GreenhouseJobDetail;
    } catch {
      return null;
    }
  }

  private matchesLocations(jobLocation: string, queryLocations: string[]): boolean {
    const normalized = this.normalizeText(jobLocation);
    return queryLocations.some((loc) => this.normalizeText(loc) === normalized || normalized.includes(this.normalizeText(loc)));
  }

  private extractCompanyFromUrl(url: string): string {
    try {
      const domain = new URL(url).hostname;
      const parts = domain.split('.');
      return parts.length > 1 ? parts[0] : domain;
    } catch {
      return 'Unknown';
    }
  }
}
