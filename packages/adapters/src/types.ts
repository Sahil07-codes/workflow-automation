import { NormalizedJob, RawJob, DiscoveryQuery } from '@autoapply/shared';

// ============ ADAPTER CAPABILITIES ============
export interface AdapterCapabilities {
  canApply: boolean; // Phase 5+
  needsLogin: boolean;
  captchaLikely: boolean;
  supportsDiscovery: boolean;
}

// ============ FORM DETECTION (PHASE 5+) ============
export interface FormField {
  name: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file' | 'date';
  required: boolean;
  label?: string;
  options?: string[];
  selector?: string;
}

export interface FormSchema {
  fields: FormField[];
  submitSelector: string;
  formId?: string;
  detectedAt: Date;
}

// ============ FILL & SUBMIT RESULTS (PHASE 5+) ============
export interface FillResult {
  success: boolean;
  filledFields: number;
  unfilledFields: FormField[];
  formChanged: boolean;
  screenshot?: Buffer;
}

export interface SubmitResult {
  success: boolean;
  confirmationId?: string;
  redirectUrl?: string;
  error?: string;
}

// ============ SOURCE ADAPTER INTERFACE ============
export interface SourceAdapter {
  id: string;
  name: string;

  // Phase 4: Discovery
  discover(query: DiscoveryQuery): AsyncIterable<RawJob>;
  parse(raw: RawJob): Promise<NormalizedJob>;

  // Phase 5: Preparation & Submission (stubbed)
  detectForm(pageUrl: string): Promise<FormSchema>;
  fill(pageUrl: string, schema: FormSchema, data: Record<string, any>): Promise<FillResult>;
  submit(pageUrl: string): Promise<SubmitResult>;

  // Capabilities
  capabilities: AdapterCapabilities;

  // Cleanup (if needed)
  cleanup?(): Promise<void>;
}

// ============ RATE LIMITER ============
export interface RateLimiter {
  acquire(weight?: number): Promise<void>;
  reset(): Promise<void>;
}

// ============ ADAPTER REGISTRY ============
export interface IAdapterRegistry {
  getAdapter(id: string): SourceAdapter | null;
  listAdapters(): SourceAdapter[];
  register(adapter: SourceAdapter): void;
}
