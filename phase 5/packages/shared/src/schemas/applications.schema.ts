import { z } from 'zod';

export const ApplicationStateSchema = z.enum([
  'DISCOVERED',
  'MATCHED',
  'PREPARING',
  'AWAITING_APPROVAL',
  'NEEDS_INPUT',
  'SUBMITTING',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'ESCALATED',
]);

export const FormFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  label: z.string(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  value: z.string().optional(),
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  disabled: z.boolean().optional(),
});

export const FormSchemaSchema = z.object({
  fields: z.array(FormFieldSchema),
  source: z.string(),
  detectedAt: z.date(),
  fieldCount: z.number(),
});

export const ApplicationSchema = z.object({
  id: z.string().cuid(),
  userId: z.string(),
  jobId: z.string(),
  state: ApplicationStateSchema,
  formSchema: FormSchemaSchema.optional(),
  matchScore: z.number().min(0).max(100),
  companyName: z.string(),
  jobTitle: z.string(),
  retryCount: z.number().min(0),
  lastErrorCode: z.string().optional(),
  lastErrorMessage: z.string().optional(),
  appliedAt: z.date().optional(),
  submittedAt: z.date().optional(),
  confirmedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ApplicationEventSchema = z.object({
  id: z.string().cuid(),
  applicationId: z.string().cuid(),
  eventType: z.string(),
  payload: z.record(z.any()).optional(),
  createdAt: z.date(),
});

export type ApplicationState = z.infer<typeof ApplicationStateSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormSchema = z.infer<typeof FormSchemaSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
