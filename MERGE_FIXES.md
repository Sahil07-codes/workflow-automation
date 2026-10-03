# Merge & Fix Log — Phase 0-2

This project was assembled by merging two separate deliveries:
- `autoapply-backend-phase0-2.zip` — had Phase 0 infra, Phase 1 auth (complete),
  and the full Prisma schema, but was missing Phase 2's actual modules
  (users/profile/preferences/answer-bank), RBAC guards, and config validation.
- `autoapply-complete-phases-0-2.zip` — had the Phase 2 modules and the
  security layer (guards/decorators/config), but was missing packages/shared,
  packages/crypto, the auth module's implementation, the Prisma schema/
  migrations, main.ts, and all of Phase 0's infra — so it could not run on
  its own.

Merging alone was not enough to produce a working project. The following
concrete, verified bugs were found by tracing actual imports and reading the
actual code (not by trusting either delivery's own summary documents), and
were fixed as part of this merge:

1. **Config validation never matched real env vars.** `configuration.ts`'s
   Joi schema required lowercase keys (`jwt_private_key`, `database_url`,
   ...), but `@nestjs/config`'s `validate` hook receives the raw `process.env`
   object, where every key is uppercase. The app would have refused to boot
   on every launch, even with a fully correct `.env`. **Fixed** by adding an
   explicit `ENV_KEY_MAP` that remaps uppercase env vars to the schema's
   lowercase keys before validating.

2. **No migration existed for the Phase 2 tables.** `schema.prisma` defined
   `Profile`, `ProfileVersion`, `JobPreferences`, and `AnswerBank`, but the
   only migration file created `users`, `otp_challenges`, and
   `refresh_tokens`. Every profile/preferences/answer-bank request would
   have failed at runtime with "relation does not exist", despite compiling
   fine. **Fixed** by adding a new migration
   (`20241002000000_add_phase2_tables`) creating all four tables, matching
   the exact field names and types already in `schema.prisma`.

3. **JWT signing and verification used different keys.** `auth.module.ts`
   signed tokens with `JWT_PRIVATE_KEY` under HS256 (a symmetric algorithm),
   while `jwt.strategy.ts` verified tokens with `JWT_PUBLIC_KEY`. Since HS256
   requires the exact same secret on both ends, every protected route would
   have rejected every valid token as an "invalid signature" — login would
   succeed, but nothing afterward would work. **Fixed** by switching to
   proper RS256 asymmetric signing: the private key now signs, the public
   key verifies, matching the original security design and the real RSA PEM
   keys already present in `.env.example`.

4. **Two required dependencies were missing from `package.json`:**
   `@nestjs/config` and `joi`, both imported by code that exists in the
   project. **Fixed** by adding both to `apps/api/package.json`.

5. **`HealthController` was never wired into the app.** No `health.module.ts`
   existed, and nothing imported it into `app.module.ts`, so `/health`,
   `/health/ready`, `/health/live` were unreachable dead code. **Fixed** by
   creating `health.module.ts` and adding it to `AppModule`'s imports.

6. **The Postgres `vector` extension was created under the wrong name.**
   The init migration ran `CREATE EXTENSION IF NOT EXISTS "pgvector"`, but
   the actual extension installed by the `pgvector/pgvector` Docker image is
   named `vector`. Since migrations run inside a transaction, this would
   have failed immediately and **no table at all** would have been created —
   meaning the original zip 1 could never have actually passed
   `npm run migrate`. **Fixed** by correcting the extension name.

7. **The `citext` extension was used but never created.** The `users.email`
   column is typed `CITEXT`, but `CREATE EXTENSION citext` was missing from
   the migration, which would also have failed the same transaction.
   **Fixed** by adding the missing `CREATE EXTENSION IF NOT EXISTS "citext"`.

8. **Missing `migration_lock.toml`.** Prisma requires this file to know the
   datasource provider; without it, `prisma migrate dev`/`deploy` behaves
   unpredictably on first run. **Fixed** by adding it (`provider = "postgresql"`).

9. **The `@/` path alias was never registered at runtime.** `tsconfig.json`
   defines `@/* -> ./*`, and both `jest.config.js` and `jest-e2e.json`
   correctly map it for tests — but nothing registered it for `npm run dev`
   or `npm run start`, so the compiled app would crash immediately with
   "Cannot find module '@/...'" on every real (non-test) run. Also,
   `nest-cli.json` was missing entirely. **Fixed** by registering
   `tsconfig-paths` manually at the top of `main.ts` with `baseUrl` pointed
   at `__dirname` (so it resolves correctly whether running from `dist/` or
   under `ts-jest` from `src/`), and adding a minimal `nest-cli.json`.

10. **`.env.test`'s JWT keys were placeholder strings, not a real key pair.**
    `JWT_PRIVATE_KEY=dev-secret-key` / `JWT_PUBLIC_KEY=dev-public-key` are not
    valid RSA PEM keys, so once RS256 was correctly wired (fix #3), every
    test touching auth would fail with "secretOrPrivateKey must be an
    asymmetric key". **Fixed** by generating a real matching 2048-bit RSA key
    pair with `openssl` and substituting it into `.env.test`.

11. **`CORS_ORIGIN` was missing from `.env.example`** even though the (now
    fixed) config validator reads it. **Fixed** by adding it.

## Noted deviations (not bugs — flagging for visibility)

- The original Phase 0-2 architecture spec called for a global
  `JwtAuthGuard` with `@Public()` marking exceptions. What was actually built
  instead applies `@UseGuards(JwtAuthGuard)` (and `RolesGuard` where needed)
  explicitly on each controller that needs protection. This is still
  secure — it's just opt-in per controller rather than default-deny
  globally — but it means a future controller that *forgets* to add the
  guard will be unintentionally public. Worth switching to the global-guard
  pattern before production if you want defense-in-depth here.
- The `repositories/` layer specified in the original architecture (a data
  access class between each service and Prisma) was not built for
  users/profile/preferences/answer-bank — those services call
  `PrismaService` directly. Not broken, just a simpler pattern than
  originally specified; makes these specific services slightly harder to
  unit-test with a mocked data layer.
- No dedicated unit or e2e tests exist yet for the **answer-bank** module
  specifically (profile and preferences both have them).

## What I could not verify myself

I don't have network access in this environment, so I could not actually run
`pnpm install`, `npm run migrate`, or the test suites against a live
database. Everything above was verified by reading the actual code and
tracing real imports/field names/schema definitions against each other, not
by executing it. **Before trusting this in staging, please run the
verification steps in the updated README yourself** and report back any
failure — at that point we're debugging a real, specific error message
rather than guessing.
