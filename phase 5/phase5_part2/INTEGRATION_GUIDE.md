# Phase 5 Part 2 Integration Guide

**Time:** 30 minutes  
**Difficulty:** Intermediate

## Step 1: Copy Source Files

```bash
# Copy API modules
cp -r apps/api/src/modules/profile/services       your-project/apps/api/src/modules/profile/
cp -r apps/api/src/modules/applications/services       your-project/apps/api/src/modules/applications/
cp -r apps/api/src/modules/applications/repositories       your-project/apps/api/src/modules/applications/
cp -r apps/api/src/modules/applications/controllers       your-project/apps/api/src/modules/applications/

# Copy worker
cp apps/worker/src/processors/approval.processor.ts    your-project/apps/worker/src/processors/

# Copy email templates
cp -r templates/emails your-project/templates/
```

## Step 2: Update Prisma Schema

```bash
# Append schema additions
cat prisma/schema-additions.prisma >>     your-project/apps/api/prisma/schema.prisma

# Edit your-project/apps/api/prisma/schema.prisma and add:
# - ApprovalToken model (from schema-additions.prisma)
# - approvedAt field to Application model
# - payloadHash field to Application model
```

## Step 3: Create Database Migration

```bash
cd your-project/apps/api
npx prisma migrate dev --name add_approval_tokens
cd ../../
```

## Step 4: Register Services

### In ProfileModule (your-project/apps/api/src/modules/profile/profile.module.ts):

```typescript
import { FieldMatcherService } from './services/field-matcher.service';
import { AnswerBankService } from './services/answer-bank.service';

@Module({
  providers: [
    FieldMatcherService,
    AnswerBankService,
  ],
  exports: [FieldMatcherService, AnswerBankService],
})
export class ProfileModule {}
```

### In ApplicationsModule (your-project/apps/api/src/modules/applications/applications.module.ts):

```typescript
import { ApprovalTokenService } from './services/approval-token.service';
import { PayloadEncryptionService } from './services/payload-encryption.service';
import { ApprovalTokenRepository } from './repositories/approval-token.repository';
import { ApprovalController } from './controllers/approval.controller';

@Module({
  controllers: [ApprovalController],
  providers: [
    ApprovalTokenService,
    PayloadEncryptionService,
    ApprovalTokenRepository,
  ],
  exports: [ApprovalTokenService, PayloadEncryptionService],
})
export class ApplicationsModule {}
```

## Step 5: Add Environment Variables

```bash
cat >> your-project/.env << EOF

# Phase 5 Part 2: Approval Workflow
APPROVAL_TOKEN_TTL_HOURS=48
ENCRYPT_PAYLOADS=true
ENCRYPTION_ALGORITHM=aes-256-gcm
APPROVAL_EMAIL_FROM=approvals@autoapply.app
FIELD_MATCHING_CONFIDENCE_THRESHOLD=0.6
EOF
```

## Step 6: Install Dependencies

```bash
cd your-project
npm install
```

## Step 7: Test Integration

### Test Field Matching

```bash
npm run test -- field-matcher.service.spec.ts
```

### Test Approval Tokens

```bash
npm run test -- approval-token.service.spec.ts
```

### Start Application

```bash
npm run dev
```

## Step 8: Manual Testing

### 1. Test Field Matcher

```bash
curl -X POST http://localhost:3000/test/field-match \
  -H "Content-Type: application/json" \
  -d '{
    "fieldName": "first_name",
    "userId": "test-user",
    "profile": { "firstName": "John" }
  }'
```

### 2. Test Token Generation

```bash
curl -X POST http://localhost:3000/test/generate-token \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "app-123"
  }'
```

### 3. Test Approval Flow

```bash
# 1. Get approval token
TOKEN=$(curl ... | jq -r '.token')

# 2. Use token to approve
curl http://localhost:3000/v1/applications/app-123/approve?token=$TOKEN
```

## ✅ Verification Checklist

- [ ] All files copied
- [ ] Prisma schema updated
- [ ] Migration successful
- [ ] Services registered
- [ ] Environment variables set
- [ ] Dependencies installed
- [ ] Tests passing
- [ ] API endpoints working
- [ ] Email templates in place

## 🆘 Troubleshooting

### Migration Fails
```bash
# Reset database (dev only!)
npx prisma migrate reset

# Or run migration explicitly
npx prisma migrate dev --name add_approval_tokens
```

### Service Not Found
```typescript
// Make sure to export from module
@Module({
  exports: [ApprovalTokenService], // Add this
})
```

### Import Errors
```bash
# Check paths match your project structure
# Update imports if needed
```

## 📊 Testing Checklist

- [ ] Token generation works
- [ ] Token hashing works
- [ ] Token verification works
- [ ] Expired tokens rejected
- [ ] Used tokens rejected
- [ ] Field matching works
- [ ] Answer bank matching works
- [ ] Unknown fields marked for input
- [ ] API endpoints return correct responses
- [ ] Database writes successful

---

**Phase 5 Part 2 integration complete!**

Next: Implement Part 3 (Submission)
