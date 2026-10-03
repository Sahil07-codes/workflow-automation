import { z } from 'zod';

/**
 * Standard error response envelope used across all endpoints
 */
export const ErrorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * Standard success response envelope
 */
export const SuccessEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().optional(),
  requestId: z.string(),
  timestamp: z.string().datetime().optional(),
  data: z.record(z.unknown()).optional(),
});

export type SuccessEnvelope = z.infer<typeof SuccessEnvelopeSchema>;

/**
 * Pagination parameters
 */
export const PaginationParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Paginated response structure
 */
export const PaginatedResponseSchema = z.object({
  items: z.array(z.record(z.unknown())),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type PaginatedResponse<T = any> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * UUID validation
 */
export const UuidSchema = z.string().uuid();

/**
 * E-mail validation
 */
export const EmailSchema = z.string().email().toLowerCase();

/**
 * Phone number in E.164 format
 */
export const PhoneE164Schema = z.string().regex(/^\+\d{1,15}$/);

/**
 * ISO 8601 DateTime
 */
export const DateTimeSchema = z.string().datetime();
