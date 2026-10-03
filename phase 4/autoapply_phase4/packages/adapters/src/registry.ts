import { SourceAdapter, IAdapterRegistry } from './types';
import { GreenhouseAdapter } from './greenhouse/greenhouse.adapter';
import { LeverAdapter } from './lever/lever.adapter';
import { AshbyAdapter } from './ashby/ashby.adapter';

/**
 * AdapterRegistry - singleton registry for all source adapters
 * Phase 4: only discover() and parse() are implemented
 * Phase 5+: fill() and submit() will be added
 */
export class AdapterRegistry implements IAdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<string, SourceAdapter> = new Map();

  private constructor() {
    this.initialize();
  }

  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  private initialize(): void {
    // Initialize from environment variables
    const greenhouseTokens = (process.env.GREENHOUSE_BOARD_TOKENS || '').split(',').filter(Boolean);
    const leverCompanies = (process.env.LEVER_COMPANY_IDS || '').split(',').filter(Boolean);
    const ashbyCompanies = (process.env.ASHBY_COMPANY_IDS || '').split(',').filter(Boolean);

    const greenhouseRps = parseInt(process.env.GREENHOUSE_RPS || '10', 10);
    const leverRps = parseInt(process.env.LEVER_RPS || '10', 10);
    const ashbyRps = parseInt(process.env.ASHBY_RPS || '10', 10);

    if (greenhouseTokens.length > 0) {
      this.register(new GreenhouseAdapter(greenhouseTokens, greenhouseRps, process.env.GREENHOUSE_PROXY_URL));
    }

    if (leverCompanies.length > 0) {
      this.register(new LeverAdapter(leverCompanies, leverRps, process.env.LEVER_PROXY_URL));
    }

    if (ashbyCompanies.length > 0) {
      this.register(new AshbyAdapter(ashbyCompanies, ashbyRps, process.env.ASHBY_PROXY_URL));
    }
  }

  getAdapter(id: string): SourceAdapter | null {
    return this.adapters.get(id.toUpperCase()) || null;
  }

  listAdapters(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.id.toUpperCase(), adapter);
  }

  async cleanupAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.cleanup) {
        try {
          await adapter.cleanup();
        } catch (error) {
          console.error(`Error cleaning up adapter ${adapter.id}:`, error);
        }
      }
    }
  }
}

export function getAdapterRegistry(): AdapterRegistry {
  return AdapterRegistry.getInstance();
}

export function getAdapter(id: string): SourceAdapter | null {
  return getAdapterRegistry().getAdapter(id);
}

export function listAdapters(): SourceAdapter[] {
  return getAdapterRegistry().listAdapters();
}
