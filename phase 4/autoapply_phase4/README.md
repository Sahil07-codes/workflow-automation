# AutoApply Phase 4: Job Discovery

Complete, production-ready implementation of job discovery, matching, and scoring pipeline.

## What's Included

- ✅ **3 ATS Adapters** (Greenhouse, Lever, Ashby) with streaming job discovery
- ✅ **Matching Pipeline** (hard filters → embedding similarity → LLM scoring)
- ✅ **Job & Match Storage** (Prisma models + Postgres)
- ✅ **BullMQ Worker System** (discovery queue, processor, scheduler)
- ✅ **REST API** (GET /jobs, filtering, pagination, stats)
- ✅ **Comprehensive Tests** (unit, integration)
- ✅ **Full Configuration** (env, schemas, migrations)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ API Layer (GET /jobs, /jobs/:id, /jobs/stats/matching)        │
│ (jobs.controller → jobs.service → jobs.repository)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    PostgreSQL (jobs, job_matches)
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│ Worker Layer (BullMQ Queue)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scheduler         Discovery         Matching         Store    │
│  (periodic)    →   (adapter)    →    (scoring)   →   (DB)     │
│                                                                 │
│  [discovery-sweep-scheduler] →                                 │
│    [discovery.processor] (adapter.discover + parse)            │
│      → EmbeddingService (1024-dim vectors)                     │
│      → MatchScoringService (hard filters + LLM)                │
│      → Upsert into jobs + job_matches                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Redis (BullMQ queue + rate-limiter state)
```

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/autoapply
REDIS_URL=redis://localhost:6379
CLAUDE_API_KEY=sk-ant-...

# Adapter config (get tokens from each ATS platform)
GREENHOUSE_BOARD_TOKENS=board-token-1,board-token-2
GREENHOUSE_RPS=10

LEVER_COMPANY_IDS=company-1,company-2
LEVER_RPS=10

ASHBY_COMPANY_IDS=company-1,company-2
ASHBY_RPS=10

# Matching config
MIN_MATCH_SCORE_THRESHOLD=50
EMBEDDING_SIMILARITY_THRESHOLD=0.65
DISCOVERY_SWEEP_INTERVAL_HOURS=4
```

### 2. Database Setup

```bash
# Run migration (creates jobs and job_matches tables)
npx prisma migrate deploy

# Verify pgvector extension
psql -U postgres -d autoapply -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Start Services

```bash
# Terminal 1: API server
npm run dev --workspace=apps/api

# Terminal 2: Discovery worker
npm run start:discovery-worker

# Terminal 3: Scheduler (optional, for automatic sweeps)
npm run start:discovery-scheduler
```

### 4. Trigger Discovery Sweep (Manual)

```bash
curl -X POST http://localhost:3000/admin/discovery/sweep \
  -H "Authorization: Bearer TOKEN"
```

Or programmatically:
```typescript
const scheduler = createDiscoverySweepScheduler(redisUrl, prisma);
await scheduler.triggerSweep();
```

### 5. Query Jobs

```bash
# List jobs
curl http://localhost:3000/jobs \
  -H "Authorization: Bearer TOKEN"

# Filter by location and min score
curl "http://localhost:3000/jobs?location=Bangalore&minMatchScore=70" \
  -H "Authorization: Bearer TOKEN"

# Get single job
curl http://localhost:3000/jobs/job-id-here \
  -H "Authorization: Bearer TOKEN"

# Get match stats
curl http://localhost:3000/jobs/stats/matching \
  -H "Authorization: Bearer TOKEN"
```

## Project Structure

```
autoapply_phase4/
├── packages/
│   ├── adapters/              # Standalone adapter package
│   │   ├── src/
│   │   │   ├── types.ts              # SourceAdapter interface
│   │   │   ├── base.adapter.ts       # Rate limiter + base class
│   │   │   ├── registry.ts           # Adapter registry
│   │   │   ├── greenhouse/
│   │   │   │   ├── greenhouse.adapter.ts
│   │   │   │   ├── greenhouse.adapter.spec.ts
│   │   │   │   └── __fixtures__/
│   │   │   ├── lever/
│   │   │   ├── ashby/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── schemas/
│       │   │   └── jobs.schema.ts    # Zod validation schemas
│       │   └── index.ts
│       └── package.json
│
├── apps/
│   ├── api/
│   │   └── src/modules/jobs/
│   │       ├── jobs.controller.ts     # GET /jobs, /jobs/:id
│   │       ├── jobs.service.ts        # Business logic
│   │       ├── jobs.repository.ts     # Prisma queries
│   │       └── jobs.module.ts         # NestJS module
│   │
│   └── worker/
│       └── src/
│           ├── queues/
│           │   └── discovery.queue.ts
│           ├── processors/
│           │   ├── discovery.processor.ts
│           │   └── discovery.processor.spec.ts
│           ├── matching/
│           │   ├── embedding.service.ts
│           │   └── match-scoring.service.ts
│           └── scheduler/
│               └── discovery-sweep.scheduler.ts
│
├── prisma/
│   ├── schema.prisma              # Schema with Phase 4 marked block
│   └── migrations/
│       └── 001_add_phase4_discovery_tables/
│           └── migration.sql
│
├── .env.example
├── DECISIONS.md                   # Detailed design decisions
└── README.md                      # This file
```

## Key Concepts

### Job Discovery

Adapters stream jobs from ATS platforms:

```typescript
// Adapter returns AsyncIterable<RawJob>
for await (const rawJob of adapter.discover({ roles: ['Backend'], locations: ['Bangalore'] })) {
  const normalized = await adapter.parse(rawJob);
  // → stored in jobs table
}
```

### Deduplication

Jobs are uniquely identified by `(source, externalId)`:
- **First run**: INSERT job
- **Second run**: UPDATE last_seen, status
- **Content changed**: UPDATE jd_text, contentHash

No duplicates ever created.

### Matching Pipeline

For each job and user:

1. **Hard Filters** (reject if):
   - Location not in preferences
   - Salary below minimum
   - Company in exclude list

2. **Embedding Similarity** (reject if similarity < 0.65)

3. **LLM Scoring** (only if passes embedding threshold):
   - Claude API call: analyze fit, extract missing skills
   - Returns score 0-100 + reasons

4. **Store Result**:
   - If score ≥ min_match_score: create JobMatch row
   - If score < threshold: no row (clean storage, faster queries)

### Rate Limiting

Each adapter has independent token bucket:
```typescript
adapter = new GreenhouseAdapter(tokens, requestsPerSecond=10);
```

Prevents one slow API from blocking others.

## Testing

```bash
# Unit tests (adapters)
npm run test -- packages/adapters

# Integration tests (processor)
npm run test -- apps/worker

# All tests
npm run test
```

Tests use:
- Mock HTTP responses (fixture JSON)
- In-memory SQLite for integration tests (or testcontainers PostgreSQL)
- Jest with comprehensive coverage

## API Endpoints

### GET /jobs
Query jobs with filters and pagination.

**Query Params:**
- `source`: 'GREENHOUSE' | 'LEVER' | 'ASHBY'
- `status`: 'OPEN' | 'CLOSED'
- `minMatchScore`: 0-100 (overrides user preference if higher)
- `location`: substring match
- `company`: substring match
- `cursor`: pagination cursor
- `limit`: 1-100 (default 20)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "source": "GREENHOUSE",
      "externalId": "12345",
      "company": "TechCorp",
      "title": "Senior Backend Engineer",
      "location": "Bangalore, India",
      "salaryMin": 1500000,
      "salaryMax": 2500000,
      "applyUrl": "https://...",
      "canonicalUrl": "https://...",
      "matchScore": 85,
      "matchReasons": ["Strong backend experience", "Location match"],
      "status": "OPEN",
      "firstSeen": "2024-01-15T10:00:00Z",
      "lastSeen": "2024-01-20T14:30:00Z"
    }
  ],
  "cursor": "next-page-id",
  "hasMore": true,
  "total": 1250
}
```

### GET /jobs/:id
Get a single job by ID.

### GET /jobs/stats/matching
Get matching statistics.

**Response:**
```json
{
  "totalJobs": 5000,
  "matchedJobs": 1250,
  "averageScore": 72,
  "scoreDistribution": [
    { "range": "0-25", "count": 50 },
    { "range": "26-50", "count": 200 },
    { "range": "51-75", "count": 600 },
    { "range": "76-100", "count": 400 }
  ]
}
```

## Environment Variables

See `.env.example` for complete list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection |
| `REDIS_URL` | ✅ | Redis for BullMQ |
| `CLAUDE_API_KEY` | ✅ | For LLM scoring |
| `GREENHOUSE_BOARD_TOKENS` | ❌ | Comma-separated Greenhouse tokens |
| `LEVER_COMPANY_IDS` | ❌ | Comma-separated Lever company IDs |
| `ASHBY_COMPANY_IDS` | ❌ | Comma-separated Ashby company IDs |
| `DISCOVERY_SWEEP_INTERVAL_HOURS` | ❌ | Default: 4 |
| `MIN_MATCH_SCORE_THRESHOLD` | ❌ | Default: 50 |
| `EMBEDDING_SIMILARITY_THRESHOLD` | ❌ | Default: 0.65 |

## Migration from Phase 3

Phase 4 is **fully independent** and does not modify Phase 3 code:

- ✅ Existing `users`, `job_preferences`, `profiles` tables untouched
- ✅ New `jobs`, `job_matches` tables isolated
- ✅ No changes to billing, authentication, or profile modules
- ✅ `JobsModule` added to `app.module.ts` (one line only)

## Performance Considerations

### Discovery
- Streaming adapters: jobs written to DB as discovered (not batch)
- Rate limited: 10 RPS per adapter by default (configurable)
- Estimated: 100-1000 jobs per sweep per adapter in ~1-5 minutes

### Matching
- Hard filters: O(1) per job
- Embedding similarity: O(1) vector operation (pgvector)
- LLM scoring: ~3-5 seconds per job (rate-limited by API quota)
- **Recommendation**: Score only top candidates (embedding similarity > threshold)

### Storage
- ~1 KB per job (title, location, URL, JD text)
- ~500 B per match (score, reasons)
- 1,000 jobs × 1,000 users = ~1.5 GB (within RDS Single-AZ bounds)

## Troubleshooting

### Discovery jobs not processing
- Check Redis is running: `redis-cli ping`
- Check processor logs: `npm run start:discovery-worker`
- Check BullMQ UI: http://localhost:3001/admin/bullmq

### LLM scoring failing
- Verify `CLAUDE_API_KEY` is valid
- Check API rate limits: `curl https://api.anthropic.com/v1/messages -H "Authorization: Bearer $CLAUDE_API_KEY"`
- Falls back to embedding scoring (lower quality but no error)

### Jobs not appearing in API
- Run manual sweep: `POST /admin/discovery/sweep`
- Check job count: `SELECT COUNT(*) FROM jobs;`
- Verify user preferences: `SELECT * FROM job_preferences WHERE user_id = ...;`

### Slow pagination
- Ensure indexes are created: check migration applied
- Add `LIMIT n` to prevent large result sets
- Consider archiving old jobs if table exceeds 1M rows

## Next: Phase 5

Phase 5 (Apply & Submit) will add:
- Playwright browser automation
- Form detection (`detectForm()`)
- Field filling (`fill()`)
- Submission (`submit()`)
- Approval workflow
- NEEDS_INPUT escalation

All adapters' Phase 5 methods are stubbed (throw `NotImplementedError`) and ready for Phase 5 implementation.

## License

Proprietary — AutoApply Co-founders

## Support

See `DECISIONS.md` for architectural details and design rationale.
