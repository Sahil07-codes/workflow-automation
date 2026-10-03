import { IsUUID, IsOptional, IsEnum } from 'class-validator';

export enum ApplicationStateEnum {
  DISCOVERED = 'DISCOVERED',
  MATCHED = 'MATCHED',
  PREPARING = 'PREPARING',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  NEEDS_INPUT = 'NEEDS_INPUT',
  SUBMITTING = 'SUBMITTING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  ESCALATED = 'ESCALATED',
}

export class StartApplicationDto {
  @IsUUID()
  jobId: string;
}

export class ApplicationResponseDto {
  id: string;
  jobId: string;
  userId: string;
  state: ApplicationStateEnum;
  formSchema?: Record<string, unknown>;
  matchScore: number;
  companyName: string;
  jobTitle: string;
  retryCount: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  appliedAt?: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ApplicationEventDto {
  id: string;
  applicationId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export class FormDetectionCacheDto {
  jobId: string;
  schema: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
