UPDATE "job_preferences"
SET "roles" = ARRAY[]::TEXT[]
WHERE "roles" IS NULL;

UPDATE "job_preferences"
SET "locations" = ARRAY[]::TEXT[]
WHERE "locations" IS NULL;

ALTER TABLE "job_preferences"
ALTER COLUMN "roles" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "roles" SET NOT NULL,
ALTER COLUMN "locations" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "locations" SET NOT NULL;

ALTER TABLE "job_preferences"
ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
