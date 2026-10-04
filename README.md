# AutoApply Backend

AutoApply is a job-application automation backend that keeps the user in control. This monorepo includes the integrated Phase 0-6 backend: authentication, profiles, billing, job discovery, application preparation/submission with explicit approval, and referrals/credits.

## Prerequisites

- **Node.js**: 20.10.0 or later (use `nvm use` to switch)
- **Docker & Docker Compose**: for PostgreSQL, Redis, and local S3 storage
- **pnpm**: v8.0+ for workspace management

## Quick Start

### 1. Clone and navigate to project
```bash
git clone <repo-url>
cd autoapply
nvm use  # Switches to Node 20.10.0
```

### 2. Copy environment template
```bash
cp .env.example .env
cp .env.example apps/api/.env
```

**Note:** The API loads `apps/api/.env`; the worker loads that file first and uses the root `.env` as fallback. The bundled PostgreSQL container is published on host port `5433` (container port `5432`), so set `DATABASE_URL` to `5433` in both files when using it. A different URL may intentionally point to another local database. Do NOT commit real `.env` files to version control.

### 3. Install dependencies and start infrastructure
```bash
pnpm install
cd frontend && npm ci
cd admin-console && npm ci
cd ../..
pnpm run docker:up
docker compose ps
```

This starts:
- **PostgreSQL 16** with pgvector extension on host port 5433
- **Redis 7** on port 6379
- **LocalStack S3** (S3-compatible) on port 9000

### 4. Set up the database
```bash
pnpm --filter @autoapply/api exec prisma migrate deploy --schema prisma/schema.prisma
```

Before migrating, verify `DATABASE_URL` in `.env` points to the intended development database and back it up if it contains data. This applies pending migrations; it does not reset the database.

### 5. Install the Playwright browser
```bash
pnpm --filter @autoapply/worker exec playwright install chromium
```

### 6. Run the API and workers
In separate terminals:
```bash
pnpm --filter @autoapply/api dev
pnpm --filter @autoapply/worker dev
npm --prefix frontend run dev
npm --prefix frontend/admin-console run dev
```

The API listens on `http://localhost:3000` (routes under `/v1`). The customer client runs on `http://localhost:5173`; the independently built admin console runs on `http://127.0.0.1:5180`. Both frontends use `VITE_API_BASE_URL=http://localhost:3000/v1` by default and can be configured independently for deployment. The worker runs discovery, Phase 5 application, and Phase 6 referral-reward queues.

### Frontend applications

The customer client and restricted admin console are separate Vite applications with independent dependency lockfiles and build outputs. Set each app's `VITE_API_BASE_URL` to the API origin including `/v1`; set the backend `CORS_ORIGIN` to the exact deployed client and admin origins (comma-separated, with no wildcard in production). The backend issues short-lived HttpOnly access and rotating refresh cookies for browser sessions. Admin routes require an authenticated `ADMIN` or `SUPERADMIN` account; ordinary user accounts cannot use the admin console.

Build both frontends with `pnpm run build:frontends`, or build the complete workspace with `pnpm run build`.

### Production release to AWS ECS

The manual `Deploy to Production` workflow can push a scanned API image to ECR and roll it out to an existing ECS service. Run it from `main` and provide a Docker-safe release version without the `v` prefix. Configure the `production` GitHub environment with:

- Secret `AWS_ROLE_TO_ASSUME`: an AWS IAM role trusted through GitHub Actions OIDC; do not use long-lived AWS access keys.
- Variables `AWS_REGION` (defaults to `ap-south-1`), `ECR_REPOSITORY`, `ECS_CLUSTER`, and `ECS_SERVICE`.
- Optional variable `ECS_CONTAINER_NAME` if the API container in the task definition is not named `api`.

The IAM role needs ECR image-push access, permission to describe/register task definitions and update/describe the configured ECS service, and narrowly scoped `iam:PassRole` for that service's task and execution roles. The ECR repository, ECS cluster, active ECS service, task definition, networking, load balancer, health check, and runtime secrets must already be provisioned. Enable the ECS deployment circuit breaker with rollback on the service.

**Infrastructure is not yet a complete production stack.** `infra/terraform` currently scaffolds an ECS cluster and load balancer but does not create the ECR repository, ECS task definition, or ECS service; the compute module is passed `enable_ecs_service = false`. Provision those resources and configure the GitHub environment before using the workflow. The workflow does not create AWS infrastructure or migrate a production database.

For production OTP delivery, configure `OTP_TRANSPORT=ses` and a verified `OTP_SENDER_EMAIL`, plus `SMS_OTP_TRANSPORT=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and an E.164 `TWILIO_FROM_NUMBER`. Store provider credentials in the runtime secret manager. `OTP_TRANSPORT=console` is development-only and the API rejects it in production.

### Observability

- Set `SENTRY_DSN` to enable Sentry error reporting; leave it empty to disable reporting locally. `SENTRY_ENVIRONMENT` optionally overrides the environment label.
- `GET /v1/metrics` exposes Prometheus HTTP request counts, request-duration histograms, and Node.js process metrics. It uses the API's normal JWT authentication; configure the scraper with a bearer token. The metrics endpoint excludes its own scrape traffic. Database pool and cache hit-rate metrics are not currently exposed.
- CloudWatch alarms require AWS credentials, a deployment region, and metrics published by the deployed service. The local API is not a Lambda function, so do not configure its alarms against the `AWS/Lambda` namespace.

### 7. Run checks (optional)
```bash
pnpm run type-check
pnpm --filter @autoapply/api exec jest --runInBand
```

## Project Structure

```
autoapply/
├─ apps/
│  ├─ api/                      # NestJS modular monolith
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/              # Guards, filters, middleware
│  │  │  ├─ database/            # Prisma client, migrations
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ users/
│  │  │  │  ├─ profile/
│  │  │  │  ├─ preferences/
│  │  │  │  └─ answer-bank/
│  │  │  └─ test/                # E2E tests
│  │  ├─ test/
│  │  └─ package.json
│  └─ worker/                    # Discovery, application, and referral workers
└─ packages/
   ├─ shared/                    # Shared schemas, types, constants
   └─ crypto/                    # Envelope encryption helpers
```

## Available Commands

### Root level
- `pnpm run dev` — Start dev server
- `pnpm run build` — Build all packages and apps
- `pnpm run test` — Run all tests
- `pnpm run test:unit` — Run unit tests only
- `pnpm run test:e2e` — Run e2e tests only
- `pnpm run lint` — Lint all packages
- `pnpm run type-check` — TypeScript type checking
- `pnpm run migrate` — Run Prisma migrations
- `pnpm run docker:up` — Start Docker services
- `pnpm run docker:down` — Stop Docker services

## Architecture Overview

### Integrated phases

- **Phases 0-2:** Infrastructure, authentication, encrypted profiles, preferences, and answer bank.
- **Phase 3:** Subscription billing and application entitlements.
- **Phase 4:** Greenhouse, Lever, and Ashby job discovery, with authenticated job listing, personalized recommendations (`GET /v1/jobs/recommended`), and keyword search (`GET /v1/jobs/search?query=...`).
- **Phase 5:** Application state tracking, form matching/preparation, encrypted payloads, approval tokens, explicit user approval, safe submission/retry, private screenshots, and ATS confirmation checks.
- **Phase 6:** Referral attribution, subscription qualification, delayed token rewards, wallet/ledger, and quota/renewal redemption.

#### Phase 5 application flow

1. An authenticated user starts an application with `POST /v1/applications/:jobId/start`.
2. The worker opens the apply page, detects and fills supported native form fields, encrypts the payload, and stores a private preparation screenshot.
3. Missing/unsupported fields transition to `NEEDS_INPUT`; otherwise the application waits in `AWAITING_APPROVAL`.
4. The user submits missing text answers through `POST /v1/applications/:id/input`, then explicitly approves through `POST /v1/applications/:id/approve` or creates a single-use 48-hour approval link through `POST /v1/applications/:id/approval-token`.
5. The worker rechecks the live form and payload integrity before submission. An uncertain result after clicking submit is escalated rather than retried to avoid duplicates.
6. `GET /v1/applications/:id` returns short-lived screenshot links only to the authenticated owner.

The worker supports generic native HTML controls. File uploads, CAPTCHA solving, and employer-specific dynamic widgets need user intervention. Greenhouse confirmation is available when `GREENHOUSE_HARVEST_API_KEY` is configured; other sources may remain `SUBMITTED` without ATS confirmation.

#### Local screenshot storage

The example `.env` configures the LocalStack S3 endpoint at `http://localhost:9000` with bucket `autoapply`. The worker creates a missing local bucket on first use. For AWS S3, provision a private bucket separately, omit `S3_ENDPOINT`, and grant the runtime identity permission to upload/read screenshot objects.

### Technology Stack

- **Language:** TypeScript
- **Backend:** NestJS
- **Database:** PostgreSQL 16 with pgvector
- **Cache/Queue:** Redis 7 + BullMQ
- **Validation:** Zod
- **Encryption:** TweetNaCl.js + AWS KMS (local mock in dev)
- **File Storage:** S3 (LocalStack in local development)
- **Testing:** Jest + Testcontainers

## Security Notes

- All secrets are loaded from `.env` (never committed)
- OTP codes are hashed with HMAC-SHA256 + pepper, never stored plaintext
- Passwords use argon2id with tuned cost parameters
- Refresh tokens are rotated on every use; reuse triggers family revocation
- PII and sensitive fields are encrypted at the application layer with envelope encryption
- All user input validated with Zod schemas
- Constant-time comparisons for all sensitive operations

## Testing

### Unit Tests
```bash
pnpm run test:unit
```

Test services in isolation with mocked repositories. Located in `*.spec.ts` files colocated with source.

### E2E Tests
```bash
pnpm run test:e2e
```

Test full HTTP flows against a real (test) database. Located in `apps/api/test/*.e2e-spec.ts`.

**Example E2E flows tested:**
- Full signup → OTP verify → login → refresh → logout
- Profile update → confirm → version history
- Answer bank CRUD

## Database

### Migrations
```bash
pnpm run migrate        # Apply pending migrations
```

Prisma migrations are version-controlled in `apps/api/prisma/migrations/`.

### Resetting (dev only)
```bash
pnpm run db:reset       # WARNING: deletes all data
```

### Viewing the schema
```bash
npm run db:studio      # Opens Prisma Studio at http://localhost:5555
```

## Troubleshooting

### "Connection refused" on database
```bash
npm run docker:up
docker compose logs postgres  # Check if it's healthy
```

### Prisma migration fails
```bash
docker compose exec postgres psql -U autoapply -d autoapply
# Run migrations manually in psql if needed
```

### Redis connection issues
```bash
docker compose logs redis
# Redis should report "Ready to accept connections"
```

### Tests fail with "port already in use"
```bash
docker compose down  # Kill all services
npm run docker:up    # Restart
npm run test         # Retry
```

## Environment Configuration

See `.env.example` for all available variables. Key groups:

- **DATABASE_URL** — PostgreSQL connection string
- **REDIS_URL** — Redis connection string
- **S3_*** — LocalStack/S3 endpoint and credentials
- **JWT_*** — RSA key pair for tokens (generate with OpenSSL if needed)
- **OTP_*** — OTP constraints (length, TTL, attempts)
- **KMS_*** — AWS KMS or local mock
- **SES_***, **MSG91_***, **RAZORPAY_*** — Third-party APIs (Phase 3+ or mocked)

## Next Steps

Deployment still requires environment-specific payment/webhook credentials, private object storage, reviewed migrations on the intended database, and Chromium installed in the worker runtime.

## Contributing

- Follow the NestJS module structure (module → controller → service → repository)
- Write tests first for new services
- Use Zod schemas for all DTOs
- All environment variables must be documented in `.env.example`
- Run `npm run lint` and `npm run type-check` before committing

## License

Proprietary — AutoApply co-founders only.
