# Architecture Decisions - AutoApply Phase 0-2

## Completed: Steps 1-2 (Infrastructure & Shared Packages)

This document records implementation decisions made during Phase 0-2 build.

### Step 1: Root Configuration & Infrastructure

#### PostgreSQL + pgvector
- **Decision:** Use `pgvector/pgvector:pg16-latest` Docker image for local development.
- **Rationale:** Avoids manual extension installation; pgvector needed for job/profile embeddings (Phase 4+).
- **Trade-off:** Slightly larger image, but negligible for dev environment.

#### S3 Local Development (LocalStack)
- **Decision:** Use LocalStack's S3 service in docker-compose.
- **Rationale:** The previously pinned MinIO image could not be pulled from its configured registry; LocalStack provides a pullable S3-compatible endpoint for local development.
- **Note:** Real S3 used in staging/prod via Terraform.

#### Environment Separation
- **Decision:** Three Terraform environments (dev, staging, prod) with separate tfvars files.
- **Rationale:** Allows easy scaling: dev (micro instances) → staging (small) → prod (medium + HA).
- **Note:** Database passwords and secrets NOT stored in Terraform; managed via AWS Secrets Manager.

#### Monorepo Structure
- **Decision:** Single monorepo with `apps/api`, `apps/worker`, `packages/shared`, `packages/crypto`.
- **Rationale:** Shared types and encryption logic must be identical across API and workers; monorepo enforces this.
- **Tool:** pnpm workspaces (lighter than Yarn, faster than npm).

---

### Step 2: Shared Packages (packages/shared & packages/crypto planned)

#### Zod for Validation
- **Decision:** Zod for all DTOs (not class-validator).
- **Rationale:** 
  - Single source of truth: one Zod schema = both TypeScript type AND runtime validation.
  - Frontend can import same schemas for client-side validation.
  - Smaller bundle than class-validator.
- **Scope:** Auth, profile, preferences, answer bank, billing (Phase 3+).

#### Error Envelope Format
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Email is required.",
  "requestId": "req-uuid",
  "details": { "field": "email" },
  "timestamp": "2024-01-15T10:30:00Z"
}
```
- **Decision:** Consistent error format across all endpoints.
- **Rationale:** Frontend can always expect `code` and `message`; easier error handling.
- **Implementation:** Custom NestJS exception filter (Phase 3 API bootstrap).

#### User Roles (4 levels)
- `USER`: Regular user (default).
- `SUPPORT`: Read-only diagnostics, can trigger retries.
- `ADMIN`: Plans, refunds, feature flags, suspensions.
- `SUPERADMIN`: Role assignment, key rotation.

- **Decision:** Assigned at signup; only SUPERADMIN can change roles.
- **Rationale:** Prevents privilege escalation; audit trail built in.

#### OTP Configuration
- **Length:** 6 digits (standard, matches SMS context).
- **TTL:** 5 minutes (balances security vs. UX).
- **Max Attempts:** 5 wrong codes → lockout for 15 min.
- **Resend Cooldown:** 60 seconds between resend requests.
- **Rate Limit:** Max 5 resends per hour per target; max 10 challenges per IP per hour.

- **Decision:** Conservative defaults; user can request code via email OTP fallback.
- **Rationale:** Protects against SMS pumping attacks without blocking legitimate users.

#### JWT Token Design
- **Access Token:** 15 minutes expiry, RS256 or EdDSA signature.
- **Refresh Token:** 30 days expiry, opaque random 256-bit, stored hashed, rotated on every use.
- **Reuse Detection:** If old refresh token is used, entire family is revoked (theft detection).
- **Claims:** `sub` (user ID), `email`, `role`, `sid` (session/family ID), `iat`, `exp`.

- **Decision:** Short access token + long rotating refresh + family revocation.
- **Rationale:** 
  - Access token short-lived, theft impact limited.
  - Refresh rotation prevents replay attacks.
  - Family revocation catches account takeover attempts.

#### Profile Versioning
- **Decision:** Every profile update creates a new `profile_versions` row (immutable).
- **Rationale:** 
  - Audit trail for applications (e.g., "applied with profile v5").
  - Rollback capability if corruption detected.
  - Support can see exactly what data was sent to employers.
- **Implementation:** Timestamps and version numbers; `profiles` table always points to latest.

#### Answer Bank Design
- **Decision:** Keyed by `question_hash` (SHA-256 of normalized question text).
- **Rationale:**
  - Exact match: "What is your notice period?" always maps to same answer.
  - Fuzzy match: embeddings added in Phase 5 for similarity ("How many days notice?").
- **Encrypted:** Answer text encrypted with per-user DEK (data encryption key).

---

## Planned: Steps 3-7 (API, Auth, Modules, Tests, CI/CD)

### Step 3: apps/api Bootstrap + Database Schema
- Full Prisma schema for Phase 0-2 tables (users, otp_challenges, refresh_tokens, profiles, profile_versions, job_preferences, answer_bank).
- Custom Prisma client configuration for envelope encryption hooks (Phase 3).

### Step 4: modules/auth (Complete Implementation + Tests)
- **Unit Tests:** `otp.service.spec.ts`, `token.service.spec.ts`, `password.service.spec.ts`.
  - Mocked repositories; focus on business rules (lockout, rotation, reuse detection).
  - Coverage target: 85%+ on auth module.
- **E2E Tests:** `auth.e2e-spec.ts` against real test database.
  - Full signup → OTP verify → login → refresh → logout cycle.
  - Reuse detection test (old token → family revocation).
  - Rate limiting test (too many OTP attempts → lockout).

### Step 5: modules/users (Simple, Critical)
- User lookup, role assignment (SUPERADMIN only), status transitions.
- No sensitive data exposure; tests mock repository.

### Step 6: modules/profile, preferences, answer-bank
- Profile encryption via `packages/crypto`.
- Profile versioning on every update.
- Preferences validation (e.g., daily cap ≤ plan limit, once Phase 3 billing exists).
- Answer bank CRUD with encryption.

### Step 7: CI/CD + apps/worker Stub
- `ci.yml`: PR → lint, type-check, unit/integration tests, npm audit, secret scan.
- `deploy-staging.yml`: Main merge → build, scan, deploy to staging, smoke tests.
- `deploy-prod.yml`: Manual approval → rolling deploy, auto-rollback.

---

## Security Decisions

### OTP Hashing
- **Decision:** `HMAC-SHA256(code, pepper)`, never store plaintext.
- **Rationale:** If database is breached, attacker cannot enumerate valid OTPs.
- **Implementation:** Constant-time comparison in `packages/crypto`.

### Password Hashing
- **Decision:** Argon2id with tuned cost parameters (Phase 1).
- **Rationale:** Resistant to GPU/ASIC attacks; newer than bcrypt.
- **Optional:** Breached-password check against have-i-been-pwned range query (Phase 3 hardening).

### Envelope Encryption for PII
- **Decision:** Per-user DEK (data encryption key) wrapped by KMS.
- **Rationale:**
  - Data key encrypted at rest; KMS key access auditable.
  - User deletion can invalidate the wrapped key (instant PII inaccessibility).
  - No secrets in database or logs.
- **Scope:** Phone, DOB, address, salary, all PII fields; profile data, answer bank, connected-account session data.

### Approval Payload Integrity
- **Decision:** Payload hash (SHA-256 canonical JSON) signed at approval time.
- **Rationale:** Prevents "form changed after approval → different data submitted" attacks.
- **Implementation:** Phase 5 automation engine verifies hash match before submit.

### Rate Limiting
- **Decision:** Redis-backed sliding window; per-IP, per-user, per-endpoint.
- **Scope:** OTP send/verify stricter (5/hour); general API looser (100/min).
- **Trade-off:** Local Redis; no distributed rate limiting yet (single-instance acceptable for MVP).

---

## Deviations from Design Doc

### None at Phase 0-2 scope.
All decisions align with the design document (Section 8.1-8.2, 11.1-11.3, 12, etc.).

---

## Technical Debt & Future Hardening

1. **Secrets Management:** Phase 0-2 uses .env locally; AWS Secrets Manager integration added during Phase 3 deployment.
2. **Distributed Rate Limiting:** Current Redis sliding window is single-instance; cluster-safe version after MVP.
3. **Breached Password Check:** Have-I-Been-Pwned range queries deferred to Phase 3 hardening.
4. **Email Verification Link:** Phased in; OTP-only for MVP. Signed links for password resets added Phase 3.
5. **S3 Signed URLs:** Auto-expire in 1 hour; presigned-URL regeneration for long sessions deferred to Phase 3.
6. **DPDP Compliance:** Data export/deletion flows skeleton only in Phase 0-2; full audit trail logging in Phase 3.

---

## Testing Strategy

### Unit Tests
- Every service file has a colocated `.spec.ts`.
- Mocked repositories; focus on logic, not database.
- Run on PR; required to merge.

### Integration Tests
- Testcontainers (PostgreSQL + Redis) spin up per test run.
- API-level tests (not HTTP layer) that verify cross-module contracts.
- Run on PR and staging deployment.

### E2E Tests
- Playwright against real HTTP endpoints in test environment.
- Full user journeys: signup → confirm profile → set preferences → answer questions.
- Run before prod deployment.

### Coverage Thresholds
- Auth module: 85%+ (security-critical).
- Other modules: 70%+ (Phase 0-2).

---

## Known Limitations & TODOs

1. **Local KMS Mock:** Phase 0-2 uses a deterministic mock (not FIPS-compliant); real AWS KMS in staging/prod.
2. **SMS Fallback:** Not implemented in MVP; email OTP only. SMS provider (MSG91) integrated Phase 3.
3. **Web Push:** Infrastructure scaffolded; Firebase Cloud Messaging integration deferred Phase 3.
4. **Browser Extension (T3):** Not built; scaffolding only. Planned Phase 9.
5. **LaTeX Sandbox:** Terraform module defined; actual pdflatex/tectonic container Phase 8.

---

## Deployment Checklist (Pre-Launch)

- [ ] DLT registration (SMS Sender ID) approved.
- [ ] Legal review: ToS, Privacy Policy, Refund Policy live.
- [ ] Pen-test: OWASP Top 10 checklist passed.
- [ ] Load test: 1,000 concurrent users, verify auto-scaling.
- [ ] Database backup restore drill: PITR and snapshot restore verified.
- [ ] On-call runbooks written and reviewed.
- [ ] CI/CD: All pipelines green in staging.
- [ ] Sentry + observability: Dashboards, alerts, SLO definitions live.

---

## Phase 0-2 known gaps (carried into Phase 3-4)

- Redis not wired for per-IP OTP limiting (launch gate: SMS-pumping protection).
- MSG91 SMS sender not implemented; SMS OTP is unavailable when `OTP_TRANSPORT=ses`.
- `/auth/logout-all` and `POST /profile/resume` (ClamAV + S3) are not implemented.
- Worker still uses Bull; design calls for BullMQ.
- Missing structure-only files: DTO folders, repositories, interceptors, shared types index.

**Next:** Transition to Option B — implement Steps 3-7 (API bootstrap, auth, tests, workers, CI/CD).
