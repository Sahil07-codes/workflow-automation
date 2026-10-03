import { z } from 'zod';

// ============ JOB QUERY FILTERS ============
export const jobListQuerySchema = z.object({
  source: z.enum(['GREENHOUSE', 'LEVER', 'ASHBY', 'JSEARCH', 'ADZUNA']).optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  location: z.string().optional(),
  company: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;

// ============ JOB RESPONSE SHAPES ============
export const normalizedJobSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.string(), // 'GREENHOUSE', 'LEVER', etc.
  externalId: z.string(),
  atsType: z.string().optional(),
  applyUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']).optional(),
  jdText: z.string().optional(),
  contentHash: z.string(),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  firstSeen: z.date().default(() => new Date()),
  lastSeen: z.date().default(() => new Date()),
  rawData: z.record(z.any()).optional(),
});

export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

export const jobMatchSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  jobId: z.string().uuid(),
  matchScore: z.number().int().min(0).max(100),
  matchReasons: z.array(z.string()).optional(),
  missingSkills: z.array(z.string()).optional(),
  createdAt: z.date().default(() => new Date()),
});

export type JobMatch = z.infer<typeof jobMatchSchema>;

export const jobResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  externalId: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  applyUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  matchScore: z.number().int().nullable(),
  matchReasons: z.array(z.string()).nullable(),
  status: z.enum(['OPEN', 'CLOSED']),
  firstSeen: z.date(),
  lastSeen: z.date(),
});

export type JobResponse = z.infer<typeof jobResponseSchema>;

export const jobsPaginatedResponseSchema = z.object({
  data: z.array(jobResponseSchema),
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number(),
});

export type JobsPaginatedResponse = z.infer<typeof jobsPaginatedResponseSchema>;

// ============ DISCOVERY QUERY ============
export const discoveryQuerySchema = z.object({
  roles: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  minSalary: z.number().int().optional(),
  keywords: z.array(z.string()).optional(),
  excludeCompanies: z.array(z.string()).optional(),
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

// ============ RAW JOB (ADAPTER-SPECIFIC) ============
export const rawJobSchema = z.object({
  externalId: z.string(),
  source: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  applyUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  jdText: z.string().optional(),
  publishedDate: z.date().optional(),
  employmentType: z.string().optional(),
  rawPayload: z.record(z.any()).optional(),
});

export type RawJob = z.infer<typeof rawJobSchema>;
