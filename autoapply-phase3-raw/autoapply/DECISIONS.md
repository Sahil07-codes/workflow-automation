# Architecture Decisions

## Authentication & Authorization

### OTP Security
- **Decision**: HMAC-SHA256 hashed OTP codes (never plaintext)
- **Rationale**: DB breach doesn't expose codes; prevents rainbow tables
- **Config**: 6 digits, 5 min TTL, 5 attempts, 60s cooldown, 15min lockout

### JWT Strategy
- **Decision**: 15 min access token + 30 day rotating refresh token
- **Rationale**: Short-lived access limits exposure; rotating refresh detects theft
- **Innovation**: Family-based revocation on reuse = theft detection

### Password Hashing
- **Decision**: Argon2id (memoryCost=64MB, timeCost=3)
- **Rationale**: GPU-resistant; tuned for modern hardware; only PHP alternative

### Token Reuse Detection
- **Decision**: Revoke entire family on old token use
- **Rationale**: Strong signal of account compromise; alerts user

## Data Protection

### Encryption
- **Decision**: Per-user DEK wrapped by KMS (envelope encryption)
- **Rationale**: Enables data isolation; supports credential rotation; FIPS-compliant

### Profile Versioning
- **Decision**: Immutable snapshots on every update
- **Rationale**: Audit trail; dispute resolution; compliance

### Answer Bank
- **Decision**: SHA-256(normalized question) as lookup key
- **Rationale**: Reuse detection; prevents duplicates; faster than hashing answer

## Rate Limiting

### OTP
- 5 attempts per challenge
- 5 resends per hour per target
- 60 second cooldown between requests
- 10 challenges per IP per hour
- 15 minute lockout after threshold

### API
- Global: 100 requests/min
- Per-user: 1000 requests/hour

## Validation

### Zod Schemas
- **Decision**: Single source of truth for DTOs
- **Rationale**: Same schema for TS types + runtime validation; no drift

### Configuration
- **Decision**: Boot-time validation with Joi
- **Rationale**: Fail fast; clear error messages; prevent runtime surprises

## Testing

### Unit Tests
- Service layer: Mocked repos for isolation
- Coverage target: 85%+

### E2E Tests
- Real database (Testcontainers)
- Real HTTP endpoints
- Full user flows

## Database

### Prisma ORM
- **Decision**: Prisma over SQL, TypeORM, Sequelize
- **Rationale**: Best TypeScript support; type-safe queries; migrations

### Timestamps
- All tables: created_at, updated_at (TIMESTAMPTZ)
- Immutable records use created_at only

## API Design

### RESTful Structure
- `/v1/auth/*` - Authentication
- `/v1/users/*` - User management
- `/v1/profile/*` - Profile CRUD
- `/v1/preferences/*` - Job preferences
- `/v1/answer-bank/*` - Q&A storage
- `/v1/health/*` - Liveness checks

### Error Envelopes
```json
{
  "code": "ERROR_CODE",
  "message": "User-facing message",
  "requestId": "unique-id",
  "timestamp": "ISO-8601",
  "details": {}
}
```

## Security Headers

- **Helmet**: HSTS, CSP, X-Frame-Options
- **CORS**: Configurable origin
- **Request IDs**: All requests tracked

## Deployment

### Environments
- **dev**: Local (docker-compose)
- **staging**: AWS (Terraform)
- **prod**: AWS multi-AZ (Terraform)

### CI/CD
- PR: Lint, type-check, test, audit
- Merge: Build, scan, deploy to staging
- Release: All tests, security scan, deploy to prod
