# AutoApply Backend - Phase 0-2

India's first AI-powered job application automation platform.

## Quick Start

### 1. Setup
```bash
cp .env.example .env
pnpm install
```

### 2. Start Services
```bash
npm run docker:up
```

### 3. Migrate Database
```bash
npm run migrate
```

### 4. Run Development Server
```bash
npm run dev
```

API runs on `http://localhost:3000`

### 5. Run Tests
```bash
npm run test              # All tests
npm run test:e2e         # E2E tests
npm run test:cov         # With coverage
```

## Architecture

- **Monorepo**: pnpm workspaces (apps/, packages/)
- **API**: NestJS with modular structure
- **Database**: PostgreSQL 16 with pgvector
- **Cache**: Redis 7
- **Storage**: S3-compatible (MinIO in dev)
- **Auth**: JWT + OTP + Refresh tokens with family revocation
- **Security**: Argon2id passwords, AES-256-GCM encryption, constant-time comparison

## Modules

- **Auth**: Complete auth system (signup, OTP, login, refresh, logout)
- **Users**: User management and admin endpoints
- **Profile**: Encrypted profile with versioning
- **Preferences**: Job search preferences
- **Answer Bank**: Encrypted Q&A storage
- **Health**: Readiness/liveness checks

## Testing

- Unit tests with 85%+ coverage
- E2E tests with real database
- Mocked repositories for isolation

## Deployment

See `FINAL_BUILD_SUMMARY.md` for detailed deployment guide.

## Documentation

- `FINAL_BUILD_SUMMARY.md` - Complete build documentation
- `DECISIONS.md` - Architecture decisions
- `IMPLEMENTATION_GUIDE.md` - Phase 3+ implementation guide
