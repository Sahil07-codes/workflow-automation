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
To start the complete local product in one terminal, including Docker services, local database migrations, API, worker, customer app, and admin console:
```bash
pnpm run dev:all
```
The local launcher refuses production mode and remote database, Redis, or S3 URLs before it applies migrations. Press `Ctrl+C` to stop the app processes; Docker services remain running. Stop those separately with `pnpm run docker:down`.

Alternatively, run services in separate terminals:
```bash
pnpm --filter @autoapply/api dev
pnpm --filter @autoapply/worker dev
npm --prefix frontend run dev
npm --prefix frontend/admin-console run dev
```

The API listens on `http://localhost:3000` (routes under `/v1`). The customer client runs on `http://localhost:5173`; the independently built admin console runs on `http://127.0.0.1:5180`. Both frontends use `VITE_API_BASE_URL=http://localhost:3000/v1` by default and can be configured independently for deployment. The worker runs discovery, application, referral-reward, job-intake, and resume-processing queues.

The customer app supports job-link intake (`POST /v1/jobs/links`), PDF resume upload (`POST /v1/resumes`), and owner-scoped in-app notifications (`GET /v1/notifications`). Users can review/delete uploaded resumes and preview extracted text through authenticated, owner-scoped endpoints. Job-link processing fetches public HTTPS pages only, validates DNS results and every redirect, and enforces response size and timeout limits. Resume PDFs are limited to 10 MB and 50 pages; uploads and extracted text are encrypted with the user's data key, and scanned-image PDFs without selectable text are not supported. Both background queues require the worker process to be running. For production, deploy and monitor the worker separately with access to Redis, S3, KMS, and PostgreSQL; the ECS API task alone does not run these background jobs.

For local signup verification, the default `OTP_TRANSPORT=console` prints email codes to the API terminal; it does not send mail or SMS. To deliver email OTPs to Gmail, use a Gmail App Password (not the account password), set `OTP_TRANSPORT=smtp`, `OTP_SENDER_EMAIL` and `SMTP_USER` to the Gmail address, `SMTP_PASSWORD` to the App Password, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and `SMTP_SECURE=true` in `apps/api/.env`. To deliver SMS OTPs, configure `SMS_OTP_TRANSPORT=twilio` and the Twilio account SID, auth token, and sender number. Keep provider secrets only in your local ignored `.env`; never paste them into chat or commit them.

### Frontend applications

The customer client and restricted admin console are separate Vite applications with independent dependency lockfiles and build outputs. Set each app's `VITE_API_BASE_URL` to the API origin including `/v1`; set the backend `CORS_ORIGIN` to the exact deployed client and admin origins (comma-separated, with no wildcard in production). The backend issues short-lived HttpOnly access and rotating refresh cookies for browser sessions. Admin routes require an authenticated `ADMIN` or `SUPERADMIN` account; ordinary user accounts cannot use the admin console.

Build both frontends with `pnpm run build:frontends`, or build the complete workspace with `pnpm run build`.

### Production release to AWS ECS

The Terraform root provisions the production API ECR repository, Fargate task definition/service, ALB target group and listeners, and an API-only ACM certificate validated through Route 53. It is enabled only when `environment = "prod"`. The HTTP listener redirects to HTTPS, the ALB checks `/v1/health/ready`, ECS runs tasks in private subnets, and the service has deployment rollback enabled.

Before applying production Terraform, configure `route53_zone_id`, `runtime_secrets_arn`, and `cors_origin`, in addition to the existing database password and production variables. `api_domain` is set in `infra/terraform/envs/prod/prod.tfvars`. `route53_zone_id` must be the hosted zone ID itself (for example, `Z123...`, without `/hostedzone/`). `cors_origin` must be a comma-separated list of the exact HTTPS customer/admin frontend origins. The Secrets Manager secret must be a JSON object with these keys: `DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `OTP_PEPPER`, `OTP_SENDER_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `KMS_KEY_ID`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Store real secret values in Secrets Manager, not Terraform source or tfvars. If the secret uses a customer-managed KMS key, also set `runtime_secrets_kms_key_arn` and allow the ECS execution role to decrypt it.

Review the Terraform plan carefully before applying; use a secured remote state backend and import any existing Route 53 API record before creating the alias if one already exists. For example, supply the zone ID, runtime-secret ARN, and frontend origins as protected CI variables or securely at plan time. Terraform creates the service infrastructure, but it does not create or seed the JSON secret.

After applying Terraform, the manual `Deploy to Production` workflow can push a scanned API image to ECR and roll it out to the ECS service. Run it from `main` and provide a Docker-safe release version without the `v` prefix. Configure the `production` GitHub environment with:

- Secret `AWS_ROLE_TO_ASSUME`: an AWS IAM role trusted through GitHub Actions OIDC; do not use long-lived AWS access keys.
- Variables `AWS_REGION` (defaults to `ap-south-1`), `ECR_REPOSITORY=autoapply-api`, `ECS_CLUSTER` (from Terraform output `ecs_cluster_name`), and `ECS_SERVICE` (from Terraform output `ecs_service_name`).
- Optional variable `ECS_CONTAINER_NAME` if the API container in the task definition is not named `api`.

The IAM role needs ECR image-push access, permission to describe/register task definitions and update/describe the configured ECS service, and narrowly scoped `iam:PassRole` for the task and execution roles created by Terraform. The ECR repository URL and API URL are available from Terraform outputs. The workflow also publishes a mutable `latest` image tag used by the initial task definition and tagged release images used for deployments.

Terraform does not create or populate the runtime Secrets Manager secret, Route 53 hosted zone, GitHub environment, GitHub OIDC IAM role, or frontend hosting. Configure these and use a secured remote Terraform state backend before applying production infrastructure. The deploy workflow does not run Terraform or migrate a production database. Apply database migrations through a separately reviewed release process.

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
