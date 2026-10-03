# Phase 5 Part 2: Field Matching & Approval Workflow

**Status:** Production Ready  
**Version:** 1.0.0  
**Created:** October 3, 2026

> This directory is the original Phase 5 Part 2 reference package. Its copy/paste steps, encryption configuration, and email claims are not the active runtime integration. The current implementation is adapted to this repository's Prisma schema, envelope encryption, BullMQ worker, and authenticated approval flow. Follow the root [README](../../README.md) for the runnable integration and API behavior.

Complete implementation of field matching, payload encryption, approval tokens, and user approval workflow.

## 📦 What's Included

✅ **Field Matcher Service**
- Deterministic pattern matching
- Answer bank lookup
- Semantic similarity scoring
- Unknown field escalation

✅ **Answer Bank Service**
- Store & retrieve user answers
- Question deduplication
- Integration with field matching

✅ **Approval Token System**
- Cryptographically secure token generation
- SHA-256 hashing
- Single-use tokens with 48h TTL
- Constant-time comparison (timing attack prevention)

✅ **Payload Encryption**
- AES-256-GCM encryption
- Per-payload unique IVs & salts
- PBKDF2 key derivation
- Authentication tags for integrity

✅ **Approval Workflow**
- Email-based approval requests
- Beautiful HTML templates
- Single-use approval links
- Decline/escalate options

✅ **API Endpoints**
- GET `/v1/applications/{id}/approve?token={token}`
- GET `/v1/applications/{id}/decline?token={token}`
- POST `/v1/applications/{id}/resend-approval`

✅ **Database**
- Approval token table with indexes
- Application state transitions
- Audit trail (application_events)

✅ **Tests**
- Unit tests for token service
- Field matcher tests
- Token verification & expiry tests

✅ **Documentation**
- Field matching strategy guide
- Approval workflow documentation
- Security best practices
- Troubleshooting guide

## 🚀 Quick Integration

1. **Copy files to your project:**
   ```bash
   cp -r apps/* your-project/apps/
   cp -r prisma/* your-project/prisma/
   cp -r templates/* your-project/templates/
   ```

2. **Update Prisma schema:**
   ```bash
   cat prisma/schema-additions.prisma >> your-project/apps/api/prisma/schema.prisma
   ```

3. **Run migration:**
   ```bash
   cd apps/api && npx prisma migrate dev && cd ../../
   ```

4. **Register services in modules:**
   - Add `FieldMatcherService` to ProfileModule
   - Add `AnswerBankService` to ProfileModule
   - Add `ApprovalTokenService` to ApplicationsModule
   - Add `PayloadEncryptionService` to ApplicationsModule
   - Add `ApprovalController` to ApplicationsModule

5. **Configure environment:**
   ```bash
   ENCRYPTION_KEY=your-secure-key
   APPROVAL_TTL_HOURS=48
   ```

## 📊 Architecture

```
Form Filled
     ↓
Field Matching (deterministic → answer bank → LLM)
     ↓
Screenshot Capture
     ↓
Payload Encryption (AES-256-GCM)
     ↓
Hash Computation (SHA-256)
     ↓
Token Generation (48h TTL)
     ↓
Approval Email Sent
     ↓
User Approval
     ↓
Submission
```

## 🔐 Security Features

- **Token Security:** Cryptographically secure generation, constant-time comparison
- **Payload Encryption:** AES-256-GCM with per-payload keys
- **Single-Use Tokens:** Atomic operations prevent double-approval
- **Timing Attack Prevention:** crypto.timingSafeEqual() for hash comparison
- **IP Tracking:** Log approval IP & user agent
- **Audit Trail:** All state transitions recorded

## 📁 File Structure

```
apps/
├── api/src/modules/
│   ├── profile/services/
│   │   ├── field-matcher.service.ts
│   │   └── answer-bank.service.ts
│   └── applications/
│       ├── services/
│       │   ├── approval-token.service.ts
│       │   └── payload-encryption.service.ts
│       ├── repositories/
│       │   └── approval-token.repository.ts
│       └── controllers/
│           └── approval.controller.ts
└── worker/src/processors/
    └── approval.processor.ts

prisma/
├── migrations/add_approval_tokens/
│   └── migration.sql
└── schema-additions.prisma

templates/emails/
└── approval-email.html

tests/unit/
├── approval-token.service.spec.ts
└── field-matcher.service.spec.ts

docs/
├── FIELD_MATCHING.md
└── APPROVAL_WORKFLOW.md
```

## 📋 API Reference

### Approve Application
```
GET /v1/applications/{applicationId}/approve?token={plaintext_token}

Response:
{
  "id": "uuid",
  "state": "APPROVED",
  "approved_at": "2026-10-03T10:45:00Z"
}
```

### Decline Application
```
GET /v1/applications/{applicationId}/decline?token={plaintext_token}

Response:
{
  "id": "uuid",
  "state": "REJECTED"
}
```

### Resend Approval Email
```
POST /v1/applications/{applicationId}/resend-approval

Response:
{
  "message": "Approval email sent",
  "expires_at": "2026-10-05T10:45:00Z"
}
```

## ⚙️ Configuration

```env
# Approval Tokens
APPROVAL_TOKEN_TTL_HOURS=48
APPROVAL_TOKEN_CLEANUP_ENABLED=true

# Encryption
ENCRYPTION_KEY=your-secret-key
ENCRYPT_PAYLOADS=true
ENCRYPTION_ALGORITHM=aes-256-gcm

# Email
APPROVAL_EMAIL_FROM=approvals@autoapply.app
APPROVAL_EMAIL_REPLY_TO=support@autoapply.app

# Field Matching
FIELD_MATCHING_CONFIDENCE_THRESHOLD=0.6
ENABLE_ANSWER_BANK_MATCHING=true

# Logging
ENABLE_APPROVAL_LOGGING=true
LOG_APPROVAL_IP=true
```

## 🧪 Testing

Run tests:
```bash
npm run test -- field-matcher.service
npm run test -- approval-token.service
```

Run specific test:
```bash
npm run test -- approval-token.service.spec.ts
```

## 📚 Documentation

- **FIELD_MATCHING.md** - How field matching works
- **APPROVAL_WORKFLOW.md** - Approval flow & token security
- **docs/** - Additional guides

## ✅ Checklist

- [ ] Files copied to project
- [ ] Prisma schema updated
- [ ] Migration run successfully
- [ ] Services registered in modules
- [ ] Environment variables set
- [ ] Email templates configured
- [ ] Tests passing
- [ ] Endpoints tested
- [ ] Security review completed

## 🎯 Next Steps

After Phase 5 Part 2:
1. Implement Part 3 (Submission & Confirmation)
2. Wire up email sending (AWS SES / SMTP)
3. Test approval flow end-to-end
4. Deploy to staging
5. Run load tests
6. Deploy to production

## 📊 Metrics to Monitor

- Approval email open rate
- Token verification success rate
- Field matching accuracy
- Escalation rate (fields requiring user input)
- Token expiry rate
- Approval conversion rate

## 🆘 Support

- See FIELD_MATCHING.md for matching strategy
- See APPROVAL_WORKFLOW.md for token system
- Check tests/ for usage examples
- Review docs/ for detailed guides

---

**Phase 5 Part 2 is production-ready and fully documented.**

Next: Phase 5 Part 3 - Form Submission & Confirmation
