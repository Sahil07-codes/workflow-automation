import { ApplicationState, Prisma } from '@prisma/client';

export interface StartApplicationDto {
  jobId: string;
}

export interface ApplicationResponseDto {
  id: string;
  jobId: string;
  userId: string;
  state: ApplicationState;
  formSchema: Prisma.JsonValue | null;
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

export interface ApplicationEventDto {
  id: string;
  applicationId: string;
  eventType: string;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface FormDetectionCacheDto {
  jobId: string;
  schema: Prisma.JsonValue;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
