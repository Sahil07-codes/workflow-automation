# Phase 4: Job Discovery — Build Decisions

## What Was Built

### 1. Database Schema
- **Added `Job` model** (if not already present from scope-creep):
  - Stores all discovered jobs globally
  - Unique constraint: `(source, externalId)` prevents duplicate imports
  - Contains: title, company, location, salary range, employment type, JD text
  - `embedding` column (pgvector, 1024-dim) for semantic similarity
  - `status` ('OPEN', 'CLOSED') to track job lifecycle
  - `firstSeen`, `lastSeen` for freshness tracking

- **Added `JobMatch` model**:
  - Bridge table: links users to scored jobs
  - Unique constraint: `(userId, jobId)` ensures one score per user per job
  - Stores: `matchScore` (0-100), `matchReasons` (JSON array), `missingSkills` (JSON array)
  - Jobs without a `JobMatch` row are below the user's `min_match_score` (not stored to save space)

- **Indexes**: Added on `(source, externalId)`, `canonicalUrl`, `(company, title, location)`, `status`, `lastSeen`
- **Migration**: `001_add_phase4_discovery_tables/migration.sql` (forward-only, non-destructive)

### 2. Adapters Package (`packages/adapters/`)
A standalone, testable package (not inside `apps/`) for reuse in Phase 4 (discovery) and Phase 5 (prepare/submit).

#### Implemented Adapters:
1. **GreenhouseAdapter**: 
   - Calls `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`
   - Fetches full job details per job ID
   - Rate limiter: configurable via `GREENHOUSE_RPS` env var

2. **LeverAdapter**:
   - Calls `https://api.lever.co/v0/postings/{companyId}`
   - Parses JSON postings directly
   - Rate limiter: `LEVER_RPS`

3. **AshbyAdapter**:
   - Calls `https://api.ashbyhq.com/public/jobs`
   - Filters by `isPublished` flag
   - Rate limiter: `ASHBY_RPS`

#### Base Infrastructure:
- **BaseAdapter**: Abstract base class with rate limiting, normalization helpers, HTTP fetch with proxy support
- **TokenBucketRateLimiter**: Thread-safe rate limiting (permits per second, supports backpressure)
- **AdapterRegistry**: Singleton registry (initialized from env vars) with `getAdapter()`, `listAdapters()`

#### Test Strategy:
- Unit tests with mocked HTTP (using fixture JSON)
- Verify normalization: raw → NormalizedJob schema validation
- Verify Phase 5 stubs throw `NotImplementedError` (detectForm, fill, submit)

### 3. Worker Services (`apps/worker/src/`)

#### Discovery Queue (`queues/discovery.queue.ts`):
- BullMQ Queue named `discovery`
- Retries: 5 attempts with exponential backoff (2s base)
- Per-adapter rate-limiter group to prevent thundering herd
- Completed jobs removed after 1 hour; failed jobs kept 24h for inspection

#### Discovery Processor (`processors/discovery.processor.ts`):
- Worker that pulls jobs from the discovery queue
- For each job:
  1. Calls `adapter.discover()` (streaming)
  2. Calls `adapter.parse()` per job
  3. **Upserts** into `jobs` table on `(source, externalId)` unique key
  4. Updates `lastSeen` if exists; updates `status` and `jdText` if content changed
- Handles errors gracefully: continues on individual job failures, retries whole sweep if adapter fails
- Progress tracking every 100 jobs

#### Embedding Service (`matching/embedding.service.ts`):
- Generates 1024-dimensional embeddings for job descriptions and user profiles
- Uses Claude API (placeholder: deterministic hash-based for MVP, upgradeable to real embedding model)
- Caches embeddings by content hash
- Provides `cosineSimilarity(a, b)` for matching
- Returns zero vector for empty/null text to prevent NaN in similarity calculations

#### Match Scoring Service (`matching/match-scoring.service.ts`):
- **Three-stage pipeline** (cheap-first):
  1. **Hard filters** (0 cost): location, salary floor, excluded companies
  2. **Embedding similarity** (embedding dimension × 2 forward pass): pgvector cosine similarity
  3. **LLM scoring** (expensive): Claude API call only for candidates above threshold
- Returns `{ score, reasons, missingSkills }` or `null` if filtered out
- **Never stores rejected matches**: JobMatch rows only created for jobs above `min_match_score`
- Validates LLM output is schema-compliant; falls back to embedding score if LLM fails

#### Scheduler (`scheduler/discovery-sweep.scheduler.ts`):
- BullMQ repeating job: triggers discovery sweep every N hours (configurable, default 4)
- Enqueues discovery job per adapter on schedule
- Can be manually triggered via `triggerSweep()`
- Supports graceful start/stop

### 4. API Modules (`apps/api/src/modules/jobs/`)

#### Jobs Repository (`jobs.repository.ts`):
- Prisma data access: `findJobsForUser()`, `findJobById()`, `countJobs()`, `upsertJobMatch()`, `markJobClosed()`
- Cursor-based pagination (efficient for large result sets)
- Automatic join with `JobMatch` data per user

#### Jobs Service (`jobs.service.ts`):
- Business logic: applies user preferences (`min_match_score` from `job_preferences`)
- Filters results by score
- Returns `JobsPaginatedResponse` schema
- Provides `/stats/matching` endpoint: score distribution, average score, etc.

#### Jobs Controller (`jobs.controller.ts`):
- `GET /jobs` — list jobs with filters (source, status, location, company, minMatchScore, cursor, limit)
- `GET /jobs/:id` — get single job by ID
- `GET /jobs/stats/matching` — get match statistics
- Uses `CurrentUser` decorator to extract authenticated user ID
- Validates query parameters via Zod schema

### 5. Configuration & Environment

#### `.env.example`:
- `CLAUDE_API_KEY` — for LLM scoring
- `EMBEDDING_MODEL` — Claude model to use
- `DATABASE_URL` — Postgres connection
- `REDIS_URL` — for BullMQ
- Per-adapter configs: tokens, company IDs, RPS limits, proxy URLs
- Discovery scheduling: `DISCOVERY_SWEEP_INTERVAL_HOURS`, `MATCHING_BATCH_SIZE`
- Feature flags: `LLM_SCORING_ENABLED`, `CLOSED_JOB_DETECTION_ENABLED`

### 6. Schemas (`packages/shared/src/schemas/jobs.schema.ts`)

Zod validation schemas:
- `jobListQuerySchema` — query params for GET /jobs
- `jobListQuerySchema` — query params for GET /jobs
- `normalizedJobSchema` — adapter output after parse()
- `rawJobSchema` — raw adapter discovery output
- `jobMatchSchema` — match score record
- `jobResponseSchema` — API response shape
- `jobsPaginatedResponseSchema` — paginated list response
- `discoveryQuerySchema` — filters passed to adapter.discover()

### 7. Tests

#### Adapter Unit Tests (`greenhouse.adapter.spec.ts`):
- Parse normalization: verify schema compliance
- Consistent content hash: same input = same hash
- Optional field handling: graceful nulls for missing data
- Capabilities validation: Phase 4 stubs correctly throw

#### Integration Tests (`discovery.processor.spec.ts`):
- Upsert logic: INSERT on first run, UPDATE on second (not duplicate)
- last_seen update: timestamp correctly advances
- Content hash changes: JD text updated when hash differs
- Unique constraint: duplicate inserts fail as expected

---

## What Was NOT Built (Out of Scope)

- **Phase 5+**: `detectForm()`, `fill()`, `submit()` adapters (stubbed to throw)
- **Phase 5+**: Application state machine, approval flow, NEEDS_INPUT handling
- **Phase 5+**: Form field detection, Playwright browser automation
- **Applications table**: Jobs can be scored, but not applied to yet
- **Billing checks**: Entitlement checks belong to Phase 3/5
- **LinkedIn/Naukri adapters**: T3/T4 sources are Phase 2+
- **LaTeX resume generation**: Phase 8
- **Admin panel**: Phase 10+

---

## Pre-Existing Models (Assumed From Phase 0-3)

The schema assumes these models exist and are NOT modified by Phase 4:
- `users`, `otp_challenges`, `refresh_tokens` (Phase 1)
- `profiles`, `profile_versions`, `job_preferences`, `answer_bank` (Phase 2)
- `applications`, `application_events`, `approval_tokens` (Phase 5, but structure known)
- `connected_accounts` (optional T3/T4)
- `plans`, `subscriptions`, `payments`, `invoices`, `webhook_events` (Phase 3)
- `referrals`, `credit_ledger` (Phase 6)
- `notifications`, `admin_audit_log` (throughout)

---

## Migration Strategy

1. Apply `001_add_phase4_discovery_tables/migration.sql` to your database
2. Verify pgvector extension is enabled: `CREATE EXTENSION IF NOT EXISTS vector;`
3. All existing Phase 0-3 data remains untouched
4. Phase 4 data (jobs, job_matches) starts empty
5. First discovery sweep populates jobs table

---

## Rate Limiting & Performance

- **Per-adapter rate limiters**: Each adapter has own token bucket, prevents one slow API from blocking others
- **Adapter health dashboard** (Phase 5+): Monitor success rates per adapter per day for ongoing maintenance
- **Deduplication by content**: Jobs with identical (source, externalId) are merged; content hash tracks updates
- **Embedding cache**: In-memory cache of embeddings to avoid recomputing for same job description
- **Streaming discovery**: Adapters stream jobs (AsyncIterable), not batch-fetch, to reduce memory and start DB writes early

---

## Security Notes

- **JD text as untrusted data**: Used in LLM prompts as delimited data blocks, not code injection
- **No authentication stored**: Adapters use public APIs only (T1 sources)
- **Proxy support**: Can route traffic through datacenter proxies for T1 sources, residential for protected sites (Phase 5)
- **Rate limiting**: Per-adapter token buckets prevent DOS, per-domain backoff on 429/5xx

---

## Known Limitations & Future Work

1. **Embedding model**: Currently hash-based deterministic (MVP). Should integrate with Claude Embeddings API or Hugging Face for better semantic understanding.
2. **Closed-job detection**: Not yet implemented (detects via 404 or "closed" text in Phase 5)
3. **Company normalizer**: Simple text-based matching; could be enhanced with company DB lookup
4. **LLM scoring fallback**: If Claude API down, falls back to embedding similarity. Could queue for retry.
5. **Adapter extensibility**: New adapters require code changes; could be data-driven (config-driven adapters for T2 aggregators)

---

## Build Order Followed

1. ✅ Schemas (jobs.schema.ts)
2. ✅ Adapters (types, base, Greenhouse, Lever, Ashby, registry)
3. ✅ Prisma schema + migration
4. ✅ Embedding & Scoring services
5. ✅ Discovery Queue & Processor
6. ✅ Scheduler
7. ✅ API Module (Controller, Service, Repository)
8. ✅ Tests & fixtures
9. ✅ Configuration (env, tsconfig, jest)

---

## Module Boundaries (Strict per Phase 4 rules)

### DO NOT TOUCH:
- `modules/billing/` — Phase 3 owns this
- `billing.schema.ts` — Phase 3 owns this
- `modules/auth/` — Phase 1 owns this
- Anything related to Razorpay, subscriptions, refunds — Phase 3

### ONLY TOUCH:
- `apps/api/src/modules/jobs/` — Phase 4 read-side only
- `apps/worker/src/queues/`, `processors/matching/`, `scheduler/` — Phase 4 discovery pipeline
- `packages/adapters/` — Phase 4 source adapters
- `packages/shared/src/schemas/jobs.schema.ts` — Phase 4 schemas
- `schema.prisma` — Phase 4 marked block only
- `app.module.ts` — One line import of JobsModule

---

## Next Steps for Phase 5 (Apply & Submit)

Phase 5 will:
1. Implement `detectForm()`, `fill()`, `submit()` in adapters
2. Use Playwright for browser automation
3. Integrate with applications table, state machine
4. Implement NEEDS_INPUT escalation
5. Implement approval flow with payload hash verification
6. Integration with entitlements check (Phase 3)

This Phase 4 foundation makes Phase 5 straightforward: matching is done; Phase 5 just needs to prep and submit.

