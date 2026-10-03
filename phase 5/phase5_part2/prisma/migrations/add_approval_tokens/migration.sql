-- CreateTable ApprovalToken
CREATE TABLE IF NOT EXISTS "approval_tokens" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "usedByIp" TEXT,
  "usedByUserAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_tokens_applicationId_key" ON "approval_tokens"("applicationId");
CREATE UNIQUE INDEX "approval_tokens_tokenHash_key" ON "approval_tokens"("tokenHash");
CREATE INDEX "approval_tokens_expiresAt_idx" ON "approval_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "approval_tokens" ADD CONSTRAINT "approval_tokens_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add column to applications table if not exists
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "payloadHash" TEXT;
