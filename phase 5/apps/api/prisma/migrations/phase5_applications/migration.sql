-- CreateEnum
CREATE TYPE "ApplicationState" AS ENUM (
  'DISCOVERED',
  'MATCHED',
  'PREPARING',
  'AWAITING_APPROVAL',
  'NEEDS_INPUT',
  'SUBMITTING',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'ESCALATED'
);

-- CreateTable applications
CREATE TABLE "Application" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "state" "ApplicationState" NOT NULL DEFAULT 'DISCOVERED',
  "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
  "formSchema" JSONB,
  "formPayload" BYTEA,
  "formPayloadHash" TEXT,
  "screenshotUrl" TEXT,
  "matchScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "companyName" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_userId_jobId_key" UNIQUE("userId", "jobId"),
  CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE
);

-- CreateTable application_events
CREATE TABLE "ApplicationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "applicationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE
);

-- CreateTable form_detection_cache
CREATE TABLE "FormDetectionCache" (
  "jobId" TEXT NOT NULL UNIQUE PRIMARY KEY,
  "schema" JSONB NOT NULL,
  "rawHtml" TEXT,
  "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "Application_userId_state_idx" ON "Application"("userId", "state");
CREATE INDEX "Application_state_nextRetryAt_idx" ON "Application"("state", "nextRetryAt");
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");
CREATE INDEX "ApplicationEvent_applicationId_idx" ON "ApplicationEvent"("applicationId");
CREATE INDEX "ApplicationEvent_eventType_idx" ON "ApplicationEvent"("eventType");
CREATE INDEX "FormDetectionCache_expiresAt_idx" ON "FormDetectionCache"("expiresAt");
CREATE INDEX "FormDetectionCache_jobId_idx" ON "FormDetectionCache"("jobId");
