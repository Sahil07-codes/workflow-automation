import { z } from 'zod';

export enum SubscriptionStatus {
  CREATED = 'CREATED',
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  HALTED = 'HALTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export const SubscribeRequestSchema = z.object({
  planId: z.string().min(1),
});

export const WebhookPayloadSchema = z.record(z.any());

export const InvoiceResponseSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  gstin: z.string().optional(),
  taxablePaise: z.number().optional(),
  gstPaise: z.number().optional(),
  pdfUrl: z.string().optional(),
  createdAt: z.date(),
});

export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>;
