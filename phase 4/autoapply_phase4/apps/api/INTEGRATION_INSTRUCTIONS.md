# Phase 4 API Integration Instructions

## Add JobsModule to Your Existing API

This is the **only** change needed to integrate Phase 4 into your existing NestJS app.

### Step 1: Update `app.module.ts`

Find your existing `app.module.ts` and add `JobsModule` to the imports:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { BillingModule } from './modules/billing/billing.module';
import { JobsModule } from './modules/jobs/jobs.module';  // ADD THIS LINE

@Module({
  imports: [
    AuthModule,
    ProfileModule,
    BillingModule,
    JobsModule,  // ADD THIS LINE
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

### Step 2: Ensure Dependencies Are Installed

```bash
npm install @anthropic-ai/sdk bullmq ioredis zod
npm install -D ts-node @types/node typescript
```

### Step 3: Run Migration

```bash
npx prisma migrate deploy
```

This will:
- Create the `jobs` table
- Create the `job_matches` table
- Add necessary indexes

### Step 4: Verify

```bash
# Start your API
npm run dev

# Test the endpoint
curl http://localhost:3000/jobs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

You should get a paginated response (empty until discovery runs).

## File Structure After Integration

Your `apps/api/src/modules/` should now have:

```
modules/
├── auth/              # Phase 1
├── profile/           # Phase 2
├── billing/           # Phase 3
└── jobs/              # Phase 4 ← NEW
    ├── jobs.controller.ts
    ├── jobs.service.ts
    ├── jobs.repository.ts
    └── jobs.module.ts
```

## Starting the Worker

In a separate terminal, start the discovery worker:

```bash
npm run start:discovery-worker
```

This will:
- Listen to the discovery queue
- Process jobs from adapters
- Score matches for users
- Update the database

## API Endpoints Available

After integration, these endpoints are immediately available:

```
GET  /jobs?source=GREENHOUSE&minMatchScore=70  # List jobs
GET  /jobs/:id                                   # Get single job
GET  /jobs/stats/matching                        # Get stats
```

All require authentication (inherited from existing auth module).

## That's It!

Phase 4 is now integrated. The only coupling point is:
- `jobs.module.ts` imported in `app.module.ts`
- Environment variables (`.env`)
- Prisma schema with Phase 4 marked block

No other modules are touched or modified.

## Troubleshooting

**Q: Jobs endpoint returns 401 Unauthorized**
- A: Ensure your AuthGuard is working. Phase 4 reuses your existing auth.

**Q: Discovery processor not starting**
- A: Check Redis is running and REDIS_URL is set
- A: Check database connection in DATABASE_URL

**Q: Jobs table not created**
- A: Run `npx prisma migrate deploy`
- A: Run `npx prisma db push` to sync schema without migration

**Q: Get empty job list even after running discovery**
- A: Confirm discovery processor is running and processing
- A: Check BullMQ queue depth: `SELECT COUNT(*) FROM jobs;`
- A: Check logs for adapter errors

See README.md for full documentation.
