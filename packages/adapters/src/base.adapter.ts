import { SourceAdapter, AdapterCapabilities, RateLimiter, FormSchema, FillResult, SubmitResult } from './types';
import { DiscoveryQuery, NormalizedJob, RawJob } from '@autoapply/shared';

// ============ TOKEN BUCKET RATE LIMITER ============
export class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private lastRefill: number = Date.now();

  constructor(private requestsPerSecond: number, initialTokens?: number) {
    this.tokens = initialTokens ?? requestsPerSecond;
  }

  async acquire(weight: number = 1): Promise<void> {
    while (true) {
      const now = Date.now();
      const secondsElapsed = (now - this.lastRefill) / 1000;
      const tokensToAdd = secondsElapsed * this.requestsPerSecond;
      this.tokens = Math.min(this.requestsPerSecond, this.tokens + tokensToAdd);
      this.lastRefill = now;

      if (this.tokens >= weight) {
        this.tokens -= weight;
        return;
      }

      const waitTime = ((weight - this.tokens) / this.requestsPerSecond) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime + 10));
    }
  }

  async reset(): Promise<void> {
    this.tokens = this.requestsPerSecond;
    this.lastRefill = Date.now();
  }
}

// ============ BASE ADAPTER CLASS ============
export abstract class BaseAdapter implements SourceAdapter {
  abstract id: string;
  abstract name: string;

  protected rateLimiter: RateLimiter;
  protected httpClient: any; // Fetch-like interface

  constructor(requestsPerSecond: number = 10, protected proxyUrl?: string) {
    this.rateLimiter = new TokenBucketRateLimiter(requestsPerSecond);
  }

  abstract discover(query: DiscoveryQuery): AsyncIterable<RawJob>;
  abstract parse(raw: RawJob): Promise<NormalizedJob>;

  get capabilities(): AdapterCapabilities {
    return {
      canApply: false, // Phase 5+
      needsLogin: false,
      captchaLikely: false,
      supportsDiscovery: true,
    };
  }

  // Phase 5 stubs - throw NotImplementedError
  async detectForm(_pageUrl: string): Promise<FormSchema> {
    throw new Error(`${this.name}: detectForm() not implemented (Phase 5)`);
  }

  async fill(_pageUrl: string, _schema: FormSchema, _data: Record<string, any>): Promise<FillResult> {
    throw new Error(`${this.name}: fill() not implemented (Phase 5)`);
  }

  async submit(_pageUrl: string): Promise<SubmitResult> {
    throw new Error(`${this.name}: submit() not implemented (Phase 5)`);
  }

  async cleanup(): Promise<void> {
    await this.rateLimiter.reset();
  }

  // Helper: HTTP fetch with rate limiting & proxy
  protected async fetch(url: string, options?: RequestInit): Promise<Response> {
    await this.rateLimiter.acquire();

    const fetchUrl = this.proxyUrl ? this.buildProxyUrl(url) : url;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; AutoApply/1.0; +https://autoapply.app)',
      ...(options?.headers || {}),
    };

    try {
      const response = await fetch(fetchUrl, { ...options, headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      throw new Error(`${this.name} fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildProxyUrl(url: string): string {
    if (!this.proxyUrl) return url;
    // Example: http://proxy:8080?url=https://example.com
    return `${this.proxyUrl}?url=${encodeURIComponent(url)}`;
  }

  // Helper: compute content hash for deduplication
  protected computeHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Helper: normalize title & company for better dedup
  protected normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }
}
