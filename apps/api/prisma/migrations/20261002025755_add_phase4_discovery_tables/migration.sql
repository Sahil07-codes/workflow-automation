-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "employment_type" TEXT,
ADD COLUMN     "raw_data" JSONB;

-- CreateTable
CREATE TABLE "job_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "match_score" INTEGER NOT NULL,
    "match_reasons" JSONB,
    "missing_skills" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_matches_user_id_match_score_idx" ON "job_matches"("user_id", "match_score");

-- CreateIndex
CREATE INDEX "job_matches_job_id_idx" ON "job_matches"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_matches_user_id_job_id_key" ON "job_matches"("user_id", "job_id");

-- CreateIndex
CREATE INDEX "jobs_last_seen_idx" ON "jobs"("last_seen");

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
