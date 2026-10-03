# Phase 6 Migration Guide

> This guide describes the original standalone migration and must not be applied to the integrated project. Phase 6 tables are part of `apps/api/prisma/migrations/20261003110000_phase5_phase6_integration`; review the active `.env` database target and use the root [README](../README.md) instructions instead.

## Database Migration

### Step 1: Review SQL
The migration file creates 5 tables with proper indexes:
- referrals
- credit_ledger
- wallets
- referral_config
- subscription_renewal_options

All migrations are idempotent (CREATE TABLE IF NOT EXISTS).

### Step 2: Run Migration
```bash
# In development
npm run prisma:migrate dev --name phase6_referrals

# In production
npm run prisma:migrate deploy
```

### Step 3: Verify Tables
```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d autoapply

# Check tables
\dt referrals
\dt credit_ledger
\dt wallets
\dt referral_config
\dt subscription_renewal_options

# Check indexes
\di idx_referrals*
```

### Step 4: Initialize Config
The referral_config table is initialized with defaults on first access:
```
token_per_qualified_referee: 500
token_to_price_reduction_percent: 0.2
token_to_app_increase: 0.1
max_tokens_per_renewal: 5000
hold_period_days: 7
enabled: true
```

## Integration Points

### 1. Auth Module (Phase 1)
In `auth.service.ts`, signup method:
```typescript
// After user created
if (signupDto.referral_code) {
  await this.referralService.attributeReferral(
    newUser.id,
    signupDto.referral_code
  );
}
```

### 2. Billing Module (Phase 3)
In `webhook-processor.service.ts`:
```typescript
async onSubscriptionActivated(userId: string) {
  // ... existing code
  
  // Award referral tokens
  await this.referralWebhookService.onSubscriptionActivated(userId);
}
```

In subscription renewal logic:
```typescript
// Show renewal options to user
const options = await this.subscriptionRenewalService
  .getRenewalOptions(subscription.id, userId);
```

### 3. Application Module (Phase 5)
Use EntitlementService to check monthly_quota:
```typescript
// EntitlementService already updated subscription with app_increase
const { allowed } = await this.entitlementService
  .canSubmitApplication(userId);
```

## Backward Compatibility

✅ All changes are additive (no breaking changes)
✅ Phase 3 billing module unaffected
✅ Phase 5 automation engine unaffected
✅ Feature flag allows gradual rollout

---

**Migration Complete**
