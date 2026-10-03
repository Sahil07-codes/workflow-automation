-- ============ PHASE 4 JOB DISCOVERY MIGRATION ============
-- Creates the Job and JobMatch tables for job discovery

-- Create jobs table
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "ats_type" TEXT,
    "apply_url" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "employment_type" TEXT,
    "jd_text" TEXT,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1024),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "first_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_data" JSONB,
    CONSTRAINT "jobs_source_external_id_key" UNIQUE("source", "external_id")
);

-- Create indexes for jobs table
CREATE INDEX "jobs_canonical_url_idx" ON "jobs"("canonical_url");
CREATE INDEX "jobs_company_title_location_idx" ON "jobs"("company", "title", "location");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");
CREATE INDEX "jobs_last_seen_idx" ON "jobs"("last_seen");

-- Create job_matches table
CREATE TABLE "job_matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "match_score" INTEGER NOT NULL,
    "match_reasons" JSONB,
    "missing_skills" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_matches_user_id_job_id_key" UNIQUE("user_id", "job_id"),
    CONSTRAINT "job_matches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE
);

-- Create indexes for job_matches table
CREATE INDEX "job_matches_user_id_match_score_idx" ON "job_matches"("user_id", "match_score");
CREATE INDEX "job_matches_job_id_idx" ON "job_matches"("job_id");
