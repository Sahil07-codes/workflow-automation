# Phase 4: Job Discovery Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│                    (Web/Mobile App)                                   │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │ HTTPS/TLS 1.2+
                              │
┌─────────────────────────────▼──────────────────────────────────────────┐
│                         API LAYER (NestJS)                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐                                                │
│  │  JobsController     │                                                │
│  │  ─────────────────  │                                                │
│  │ GET /jobs           │                                                │
│  │ GET /jobs/:id       │                                                │
│  │ GET /jobs/stats     │                                                │
│  └────────────┬────────┘                                                │
│               │                                                         │
│  ┌────────────▼────────────┐                                            │
│  │   JobsService           │                                            │
│  │  ─────────────────────  │                                            │
│  │ • Filter by preferences │                                            │
│  │ • Apply min_match_score │                                            │
│  │ • Transform to schema   │                                            │
│  └────────────┬────────────┘                                            │
│               │                                                         │
│  ┌────────────▼────────────────────────┐                                │
│  │     JobsRepository                  │                               │
│  │  ─────────────────────────────────  │                               │
│  │ • Prisma queries                    │                               │
│  │ • Cursor pagination                 │                               │
│  │ • Join with JobMatch scores         │                               │
│  └────────────┬────────────────────────┘                                │
│               │                                                         │
└───────────────┼────────────────────────────────────────────────────────┘
                │
                │ SQL (Prisma ORM)
                │
┌───────────────▼────────────────────────────────────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐          ┌──────────────────────┐            │
│  │      jobs            │  1 : N   │   job_matches        │            │
│  │ ────────────────────│◄─────────►│ ────────────────────│            │
│  │ id (PK)             │          │ id (PK)              │            │
│  │ source              │          │ user_id              │            │
│  │ external_id         │ Unique   │ job_id (FK)          │            │
│  │ ats_type            │ (source, │ match_score (0-100)  │            │
│  │ title               │  ext_id) │ match_reasons (JSON) │            │
│  │ company             │          │ missing_skills       │            │
│  │ location            │          │ created_at           │            │
│  │ salary_min/max      │          │                      │            │
│  │ employment_type     │          │ Indexes:             │            │
│  │ jd_text             │          │ (user_id, job_id)    │            │
│  │ content_hash        │          │ (user_id, score)     │            │
│  │ embedding (pgvector)│          │ (job_id)             │            │
│  │ status (OPEN/CLOSED)│          │                      │            │
│  │ first_seen          │          │                      │            │
│  │ last_seen           │          │                      │            │
│  │                     │          │                      │            │
│  │ Indexes:            │          │                      │            │
│  │ (source, ext_id)    │          │                      │            │
│  │ canonical_url       │          │                      │            │
│  │ (company, title)    │          │                      │            │
│  │ status              │          │                      │            │
│  │ last_seen           │          │                      │            │
│  └──────────────────────┘          └──────────────────────┘            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                   WORKER LAYER (BullMQ + Node.js)                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                 DISCOVERY SCHEDULER                                │  │
│  │ ─────────────────────────────────────────────────────────────────  │  │
│  │ Repeating job: every 4 hours (configurable)                        │  │
│  │ Enqueues: [discover-GREENHOUSE, discover-LEVER, discover-ASHBY]   │  │
│  └───────────────────────┬────────────────────────────────────────────┘  │
│                          │ Enqueue                                        │
│                          │                                                │
│  ┌───────────────────────▼────────────────────────────────────────────┐  │
│  │            DISCOVERY QUEUE (BullMQ on Redis)                       │  │
│  │ ─────────────────────────────────────────────────────────────────  │  │
│  │ Queue: 'discovery'                                                 │  │
│  │ Jobs: {adapterId, params}                                          │  │
│  │ Retries: 5 with exponential backoff                                │  │
│  │ Rate limiting: per-adapter token bucket                            │  │
│  └───────────────────────┬────────────────────────────────────────────┘  │
│                          │ Dequeue & Process                             │
│                          │                                                │
│  ┌───────────────────────▼────────────────────────────────────────────┐  │
│  │         DISCOVERY PROCESSOR (Worker Thread Pool)                   │  │
│  │ ─────────────────────────────────────────────────────────────────  │  │
│  │                                                                    │  │
│  │  For each job in queue:                                           │  │
│  │  1. Get adapter from registry                                     │  │
│  │  2. Call adapter.discover() → AsyncIterable<RawJob>             │  │
│  │  3. For each rawJob:                                              │  │
│  │     a. Call adapter.parse() → NormalizedJob                      │  │
│  │     b. Upsert into jobs table                                     │  │
│  │        - INSERT if (source, external_id) is new                  │  │
│  │        - UPDATE last_seen if exists                               │  │
│  │        - UPDATE jd_text if content_hash changed                  │  │
│  │                                                                    │  │
│  └───────────────────────┬────────────────────────────────────────────┘  │
│                          │ Write                                          │
│                          ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │     MATCHING PIPELINE (Per User, Per Discovered Job)              │  │
│  │ ─────────────────────────────────────────────────────────────────  │  │
│  │                                                                    │  │
│  │  Stage 1: HARD FILTERS (O(1))                                     │  │
│  │  ├─ Location check against job_preferences.locations             │  │
│  │  ├─ Salary floor: job.salaryMin >= prefs.minSalary               │  │
│  │  └─ Excluded companies filter                                     │  │
│  │     → Result: Pass/Fail (reject if any fail)                      │  │
│  │                                                                    │  │
│  │  Stage 2: EMBEDDING SIMILARITY (Medium Cost)                      │  │
│  │  ├─ EmbeddingService.embed(job.jdText)                           │  │
│  │  ├─ EmbeddingService.embed(user_profile)                         │  │
│  │  ├─ pgvector cosine_similarity()                                 │  │
│  │  └─ Threshold: 0.65 (configurable)                                │  │
│  │     → Result: score 0-1 (reject if < threshold)                   │  │
│  │                                                                    │  │
│  │  Stage 3: LLM SCORING (Expensive, Only If Stage 2 Passes)        │  │
│  │  ├─ Claude API call: analyze fit vs profile                      │  │
│  │  ├─ Extract: score (0-100), reasons, missing_skills              │  │
│  │  └─ Validate output schema                                        │  │
│  │     → Result: {score, reasons, missingSkills}                     │  │
│  │                                                                    │  │
│  │  Stage 4: STORE RESULT                                             │  │
│  │  ├─ If score >= user.job_preferences.min_match_score:            │  │
│  │  │  └─ INSERT/UPDATE into job_matches                             │  │
│  │  └─ Else:                                                          │  │
│  │     └─ Don't store (saves space)                                   │  │
│  │                                                                    │  │
│  └───────────────────────┬────────────────────────────────────────────┘  │
│                          │ Upsert                                         │
│                          ▼                                                │
│                     PostgreSQL                                            │
│                     (job_matches)                                         │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                   ADAPTER LAYER (Standalone Package)                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      SourceAdapter Interface                     │   │
│  │ ────────────────────────────────────────────────────────────    │   │
│  │                                                                  │   │
│  │ Phase 4: Implemented                                            │   │
│  │  • discover(query): AsyncIterable<RawJob>                      │   │
│  │  • parse(raw): Promise<NormalizedJob>                          │   │
│  │                                                                  │   │
│  │ Phase 5+: Stubbed (throw NotImplementedError)                  │   │
│  │  • detectForm(page): Promise<FormSchema>                       │   │
│  │  • fill(page, schema, data): Promise<FillResult>              │   │
│  │  • submit(page): Promise<SubmitResult>                         │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐   │
│  │ GreenhouseAdapter    │  │   LeverAdapter       │  │ AshbyAdapter │   │
│  │ ─────────────────────│  │ ───────────────────  │  │ ─────────────│   │
│  │ discovers from       │  │ discovers from       │  │ discovers    │   │
│  │ greenhouse.io        │  │ lever.co             │  │ from         │   │
│  │                      │  │                      │  │ ashbyhq.com  │   │
│  │ Rate limiter: 10 RPS │  │ Rate limiter: 10 RPS │  │ Rate: 10 RPS │   │
│  │ (configurable)       │  │ (configurable)       │  │ (config)     │   │
│  └──────────────────────┘  └──────────────────────┘  └──────────────┘   │
│                                                                           │
│  All share:                                                              │
│  • BaseAdapter: rate limiter, HTTP fetch, proxy support                │
│  • TokenBucketRateLimiter: thread-safe RPS limit                       │
│  • Helper methods: hash, normalize, extract company                    │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

Redis (BullMQ Queue + Rate Limiter State)
```

## Data Flow Diagram

```
                          TIME PROGRESSION →

1. SCHEDULED SWEEP (Every 4 hours)
   ┌─────────────────────────────┐
   │  discovery-sweep-scheduler  │
   │  (BullMQ repeating job)     │
   └──────────────┬──────────────┘
                  │ Enqueue 3 jobs
                  ▼
        ┌────────────────────┐
        │ discovery-queue    │
        │ ├─discover-GH      │
        │ ├─discover-LEVER   │
        │ └─discover-ASHBY   │
        └────────────────────┘
                  │
2. DISCOVERY (Concurrent, per-adapter)
                  ▼
        ┌────────────────────────────────┐
        │   discovery-processor          │
        │  (Worker pool, concurrency=5)  │
        │                                │
        │ Greenhouse Token 1:            │
        │  discover() → 500 jobs         │
        │  parse each → NormalizedJob    │
        │                                │
        │ Lever Company 1:               │
        │  discover() → 300 jobs         │
        │  parse each → NormalizedJob    │
        │                                │
        │ Ashby Company 1:               │
        │  discover() → 200 jobs         │
        │  parse each → NormalizedJob    │
        └───────────┬────────────────────┘
                    │ Upsert (deduped)
                    ▼
            ┌─────────────┐
            │ jobs table  │ ← 1000 rows total
            │ ────────────│   (some new, some updated)
            │ (global)    │   ← indexed by (source, external_id)
            └────────────┬┘
                         │
3. MATCHING (Per user, per job)
                         ▼
            ┌──────────────────────────┐
            │ For each (user, job)     │
            │                          │
            │ 1. Hard filters          │
            │    (location, salary)    │
            │    → 30% rejected        │
            │                          │
            │ 2. Embedding similarity  │
            │    (pgvector cosine)     │
            │    → 50% rejected        │
            │                          │
            │ 3. LLM scoring           │
            │    (Claude API)          │
            │    → 20% rejected        │
            │                          │
            │ 4. Store (if score >= threshold)
            │    → 200 matches stored  │
            └───────────┬──────────────┘
                        │ Upsert
                        ▼
            ┌──────────────────────────┐
            │ job_matches table        │
            │ ────────────────────────│
            │ (per-user scoring)       │
            │ indexed by (user, job)   │
            └──────────────────────────┘
                        │
4. API QUERY (User requests)
                        ▼
            ┌──────────────────────────┐
            │ GET /jobs                │
            │                          │
            │ JobsRepository:          │
            │  SELECT jobs.*           │
            │  LEFT JOIN job_matches   │
            │  WHERE user_id = ?       │
            │  AND match_score >= pref │
            │  LIMIT 20 (paginated)    │
            └──────────────────────────┘
                        │
                        ▼
            ┌──────────────────────────┐
            │ JobResponse[]            │
            │ (with scores + reasons)  │
            │ (paginated cursor)       │
            └──────────────────────────┘
```

## Component Responsibilities

### API Module (Controller → Service → Repository)
- **Responsibility**: Read-facing REST endpoints
- **Scope**: GET /jobs, filtering, pagination, stats
- **Does NOT**: write, apply, submit, approve
- **Reuses**: job_preferences from Phase 2

### Worker Module (Queue → Processor → Matching → Scheduler)
- **Responsibility**: Background job processing
- **Scope**: discovery, parsing, scoring, storage
- **Does NOT**: serve HTTP, handle auth, manage payments
- **Concurrency**: 5 processors per worker pool

### Adapter Module (Standalone Package)
- **Responsibility**: Source-agnostic job discovery interface
- **Scope**: fetch → parse → normalize
- **Does NOT**: fill forms, submit applications (Phase 5)
- **Reusability**: Used by both Phase 4 (discover) and Phase 5 (apply)

### Matching Services
- **EmbeddingService**: Vector generation + cosine similarity
- **MatchScoringService**: 3-stage pipeline (filters → embedding → LLM)

## Dependency Graph

```
Apps/API
  ├─ JobsModule
  │  ├─ JobsController
  │  ├─ JobsService
  │  │  └─ JobsRepository
  │  │     └─ @prisma/client (Job, JobMatch models)
  │  └─ @autoapply/shared (schemas, types)
  │
  ├─ AuthModule (inherited from Phase 1)
  ├─ PrismaClient (inherited from Phase 0)
  └─ (Phase 3 & other modules untouched)

Apps/Worker
  ├─ DiscoveryQueue (BullMQ)
  │  └─ redis (ioredis)
  ├─ DiscoveryProcessor
  │  ├─ @autoapply/adapters (all adapters)
  │  ├─ EmbeddingService
  │  │  └─ @anthropic-ai/sdk
  │  ├─ MatchScoringService
  │  │  └─ @anthropic-ai/sdk
  │  └─ @prisma/client
  ├─ DiscoverySweepScheduler
  │  └─ BullMQ Queue
  └─ redis

Packages/Adapters
  ├─ BaseAdapter
  │  ├─ TokenBucketRateLimiter
  │  └─ (HTTP fetch, helpers)
  ├─ GreenhouseAdapter (BaseAdapter)
  ├─ LeverAdapter (BaseAdapter)
  ├─ AshbyAdapter (BaseAdapter)
  ├─ AdapterRegistry
  └─ @autoapply/shared (schemas)

Packages/Shared
  └─ jobs.schema.ts (Zod schemas)
```

## State Management

### Queue States (BullMQ)
```
WAITING → ACTIVE → COMPLETED (or FAILED → WAITING on retry)
```

### Job States (Database)
```
Job.status: 'OPEN' | 'CLOSED'

JobMatch exists ⟺ score >= min_match_score
(No row = rejected match, saved storage)
```

## Scaling Considerations

### Horizontal Scaling
- **API**: Stateless, scales horizontally behind load balancer
- **Workers**: Each worker pool is independent; add more workers by increasing concurrency
- **Database**: RDS Multi-AZ for HA; read replica for analytics

### Rate Limiting Strategy
- **Per-adapter**: Token bucket prevents one API overload
- **Per-user**: Can be added to job_preferences (Phase 5+)
- **Global**: WAF rules (Phase 5+)

### Performance Optimization
1. **Streaming discovery**: Don't batch-fetch 10K jobs; stream + upsert
2. **Embedding cache**: In-memory cache of embeddings by content hash
3. **Indexed queries**: (source, externalId) unique for O(1) lookup
4. **Paginated API**: Cursor-based pagination prevents full table scans
5. **Job filtering**: Hard filters reject 70-80% before expensive LLM call

### Storage Growth
- **jobs table**: ~1 KB per row → 1,000 jobs = 1 MB
- **job_matches**: ~500 B per row → 1,000 users × 200 matches = 100 MB
- **Indexes**: ~20% of data size
- **With 1,000 users over 1 year**: ~100-200 GB (comfortable for RDS)

## Failure Modes & Recovery

| Scenario | Handling |
|----------|----------|
| Worker crashes mid-discovery | Job retries (5x with backoff); other jobs continue |
| Adapter API rate-limited (429) | Token bucket backs off; no request sent for ~1 min |
| LLM API down | Falls back to embedding score; no error |
| Database offline | Worker job retries; manual intervention needed |
| Duplicate job submitted from multiple adapters | Deduped by content_hash + canonical_url in Phase 5 |
| Webhook delivery lost | Reconciliation job runs hourly (Phase 5+) |

## Monitoring & Observability

### Metrics to Track
- Discovery queue depth (jobs waiting)
- Processor throughput (jobs/sec)
- Match score distribution (histogram)
- Adapter health (success rate per adapter)
- LLM token usage (budget tracking)
- Database connection pool usage
- Redis memory usage

### Dashboards (Recommended)
- BullMQ Admin UI: http://localhost:3001 (queue inspection)
- Prometheus/Grafana: custom metrics (Phase 5+)
- Sentry: error tracking (Phase 5+)
- CloudWatch: AWS logs (production)

## Security Architecture

- **Data in transit**: TLS 1.2+ for all APIs
- **Data at rest**: Encrypted at DB level (RDS KMS)
- **PII handling**: Profile data encrypted with per-user DEK (Phase 2)
- **Secrets**: Never in code; AWS Secrets Manager (Phase 5+)
- **Auth**: JWT + refresh token rotation (Phase 1)
- **RBAC**: Role-based access control via decorators (Phase 1)
- **LLM guardrails**: Prompts delimited, outputs schema-validated
- **Adapter safety**: Public APIs only; no credentials stored

## Next Phase (Phase 5)

Phase 5 will:
- Implement `detectForm()` in adapters (Playwright)
- Implement `fill()` in adapters (field mapping, LLM-assisted)
- Implement `submit()` in adapters (form submission, idempotency)
- Integrate with applications table (state machine)
- Implement approval workflow (payload hash verification)
- Add NEEDS_INPUT escalation (missing fields)

**Foundation from Phase 4**: Jobs are matched and ready. Phase 5 only needs to "prepare" (fill) and "submit".
