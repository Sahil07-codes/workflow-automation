# Phase 6 (Referrals + Credit Ledger) — Complete Implementation

**Date:** October 2, 2026  
**Status:** Production-Ready  
**Version:** 1.0

> This document describes the original Phase 6 reference design. The active integration uses `User.referral_code` for reusable inviter codes, records attributed signups in the existing referrals schema, and schedules rewards after the configured hold period. Do not follow the copy/paste migration steps here; use the root [README](../README.md) and consolidated Prisma migration instead.

---

## 📋 Overview

Phase 6 implements a complete referral system with credit ledger for AutoApply:

- ✅ User A refers User B → gets tokens when B buys subscription
- ✅ User A at renewal → can use tokens to reduce price OR increase apps
- ✅ All token values are admin-configurable (no code changes)
- ✅ Double-spend prevention + fraud detection
- ✅ Append-only ledger (fraud-proof)
- ✅ Production-ready security

---

## 🎯 Core Features

### 1. Referral Code Generation
```typescript
// User A generates unique 8-char referral code
GET /v1/referrals/me
POST /v1/referrals/generate → "PR1Y4BK2"
```

### 2. Token Award on Subscription
```
User B signs up with code → attributed to User A
User B buys subscription
Razorpay webhook: subscription.activated
User A automatically gets 500 tokens ✅
```

### 3. Token Redemption (2 Options)

**Option 1: Price Discount**
```
500 tokens × 0.2% = 1% discount = ₹10 savings
Original: ₹999 → New: ₹989 ✅
```

**Option 2: App Increase**
```
500 tokens × 0.1 = 50 extra applications
New quota: 100 → 150 apps/month ✅
```

### 4. Admin Configuration (No Code Changes)
```json
{
  "token_per_qualified_referee": 500,
  "token_to_price_reduction_percent": 0.2,
  "token_to_app_increase": 0.1,
  "max_tokens_per_renewal": 5000,
  "hold_period_days": 7,
  "enabled": true
}
```

---

## 🏗️ Architecture

### Database (5 Tables)
1. **referrals** — Referral codes + status (PENDING → QUALIFIED)
2. **credit_ledger** — Append-only transaction log (fraud-proof)
3. **wallets** — Cached balance (total_earned - total_spent)
4. **referral_config** — Admin-editable config
5. **subscription_renewal_options** — Renewal choices

### Services (6)
1. **ReferralService** — Code generation, attribution, qualification
2. **CreditLedgerService** — Token transactions (transaction-safe)
3. **ReferralConfigService** — Config management (cached + versioned)
4. **SubscriptionRenewalService** — Renewal detection & options
5. **TokenRedemptionService** — Apply discount or app increase
6. **ReferralWebhookService** — Razorpay webhook handler

### Repositories (5)
- ReferralRepository
- CreditLedgerRepository
- WalletRepository
- ReferralConfigRepository
- SubscriptionRenewalRepository

### API Endpoints (11)
- 3 Referral: GET/POST generate, GET status
- 3 Wallet: GET balance, transactions, summary
- 3 Renewal: GET options, POST redeem, GET upcoming
- 2 Admin: GET/PUT config

---

## 📁 File Structure

```
apps/api/src/modules/referrals/
├── referrals.controller.ts           (11 endpoints)
├── referrals.module.ts               (module container)
├── referrals.service.spec.ts         (tests)
├── dto/
│   ├── generate-referral.dto.ts
│   ├── redeem-tokens.dto.ts
│   └── referral-config.dto.ts
├── repositories/
│   ├── referral.repository.ts
│   ├── credit-ledger.repository.ts
│   ├── wallet.repository.ts
│   ├── referral-config.repository.ts
│   └── subscription-renewal.repository.ts
└── services/
    ├── referral.service.ts
    ├── credit-ledger.service.ts
    ├── referral-config.service.ts
    ├── subscription-renewal.service.ts
    ├── token-redemption.service.ts
    └── referral-webhook.service.ts

packages/shared/src/schemas/
└── referrals.schema.ts               (Zod schemas + enums)

apps/api/prisma/migrations/phase6_referrals/
└── migration.sql                     (80 lines, 5 tables)
```

---

## 🚀 Installation

### 1. Copy Files
Copy the entire `referrals/` module to `apps/api/src/modules/`

### 2. Update Prisma
```bash
# Add migration
cp migration.sql apps/api/prisma/migrations/phase6_referrals/

# Run migration
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate
```

### 3. Import Module
```typescript
// apps/api/src/app.module.ts
import { ReferralsModule } from './modules/referrals/referrals.module';

@Module({
  imports: [
    // ... other modules
    ReferralsModule,
  ],
})
export class AppModule {}
```

### 4. Hook Webhook
```typescript
// In webhook-processor.service.ts, handle subscription.activated event:
import { ReferralWebhookService } from '../referrals/services/referral-webhook.service';

// In constructor
constructor(private referralWebhook: ReferralWebhookService) {}

// In onSubscriptionActivated handler
await this.referralWebhook.onSubscriptionActivated(userId);
```

### 5. Add to Auth Signup
```typescript
// In auth.service.ts, signup method:
import { ReferralService } from '../referrals/services/referral.service';

// In constructor
constructor(private referralService: ReferralService) {}

// After user created, if referral_code provided:
if (signupDto.referral_code) {
  await this.referralService.attributeReferral(newUser.id, signupDto.referral_code);
}
```

---

## 📊 API Examples

### Generate Referral Code
```bash
curl -X POST \
  -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/v1/referrals/generate

# Response
{
  "code": "PR1Y4BK2"
}
```

### Get Wallet Balance
```bash
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/v1/wallet/balance

# Response
{
  "total_earned": 500,
  "total_spent": 0,
  "balance": 500
}
```

### Get Renewal Options
```bash
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/v1/subscriptions/:subscription_id/renewal-options

# Response
{
  "subscription_id": "sub-123",
  "tokens_available": 500,
  "price_discount_option": {
    "tokens_needed": 500,
    "discount_percent": 1,
    "discount_paise": 999,
    "original_price_paise": 99900,
    "new_price_paise": 98901
  },
  "app_increase_option": {
    "tokens_needed": 500,
    "app_increase": 50,
    "new_monthly_quota": 150
  }
}
```

### Redeem Tokens for Discount
```bash
curl -X POST \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"option": "PRICE_DISCOUNT", "tokens_to_redeem": 500}' \
  http://localhost:3000/v1/subscriptions/:id/redeem-tokens

# Response
{
  "option": "PRICE_DISCOUNT",
  "tokens_redeemed": 500,
  "discount_paise": 999,
  "new_price_paise": 98901
}
```

### Update Admin Config
```bash
curl -X PUT \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "token_per_qualified_referee": 750,
    "token_to_price_reduction_percent": 0.25,
    "token_to_app_increase": 0.15
  }' \
  http://localhost:3000/v1/admin/referral-config

# Response
{
  "id": 1,
  "token_per_qualified_referee": 750,
  "token_to_price_reduction_percent": 0.25,
  "token_to_app_increase": 0.15,
  "max_tokens_per_renewal": 5000,
  "hold_period_days": 7,
  "enabled": true,
  "updated_at": "2026-10-02T12:00:00Z"
}
```

---

## 🔐 Security Features

✅ **Double-Spend Prevention**
```sql
-- Row-level lock during token spend
SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE;
```

✅ **Idempotent Ledger**
```sql
-- Same referral cannot award tokens twice
UNIQUE (reason, ref_id, user_id)
```

✅ **Fraud Detection**
- Self-referral check (referrer_id ≠ referee_id)
- Disposable email domain blocking
- Device/IP duplicate detection
- Anomaly flags logged to referrals.fraud_flags

✅ **Token Hold Period**
- Tokens locked for N days after qualification (configurable)
- Not usable until hold period expires

---

## 🧮 Token Calculations

### Price Discount Formula
```
discount_percent = tokens_redeemed × token_to_price_reduction_percent
discount_paise = (plan_price_paise × discount_percent) ÷ 100
new_price = plan_price_paise - discount_paise
```

**Example:**
- Tokens: 500
- Reduction %: 0.2 per token
- Plan: ₹999 (99900 paise)
- Discount %: 500 × 0.2% = 1%
- Discount: (99900 × 1) ÷ 100 = 999 paise = ₹10
- New price: ₹999 - ₹10 = **₹989**

### App Increase Formula
```
app_increase = floor(tokens_redeemed × token_to_app_increase)
new_monthly_quota = plan_monthly_quota + app_increase
```

**Example:**
- Tokens: 100
- App increase rate: 0.1 per token
- Plan quota: 100 apps
- Increase: floor(100 × 0.1) = 10 apps
- New quota: 100 + 10 = **110 apps**

---

## 🧪 Testing

### Run Unit Tests
```bash
npm run test -- referrals.service.spec
```

### Test Scenarios

**1. Happy Path**
```
Day 1: priya@example.com generates code → "PR1Y4BK2"
Day 2: john@example.com signs up with code → PENDING
Day 3: john buys subscription → webhook fires → QUALIFIED
Day 3: priya gets 500 tokens in wallet ✅
```

**2. Token Redemption - Discount**
```
priya has 500 tokens
Month 2 renewal approaches
priya chooses: use tokens for discount
Calculation: 500 × 0.2% = 1% = ₹10
Price: ₹999 → ₹989 ✅
```

**3. Token Redemption - Apps**
```
priya has 500 tokens
Month 2 renewal approaches
priya chooses: use tokens for +50 apps
Calculation: 500 × 0.1 = 50 apps
Quota: 100 → 150 apps/month ✅
```

**4. Config Change**
```
Admin updates config: token_per_qualified_referee: 500 → 750
Next referral qualification awards 750 tokens (new config) ✅
```

**5. Self-Referral Block**
```
priya tries to refer herself → rejected ✅
```

---

## 📈 Monitoring

### Metrics to Track
- Referral rate: % of signups attributed
- Qualification rate: % of attributed users who buy
- Token redemption: % choosing discount vs app increase
- Fraud detection: anomalies flagged per day
- Wallet balance: total earned/spent per user

### Alerts
- Duplicate referral codes (should never happen)
- Wallet balance goes negative (logic error)
- Unusually high tokens/user (fraud)
- Config change (audit log)

---

## 🚀 Deployment

### Pre-Deployment Checklist
- [ ] Run all tests
- [ ] Test Razorpay webhook integration
- [ ] Test referral attribution flow
- [ ] Test token redemption (both options)
- [ ] Load test with 1000 concurrent referrals
- [ ] Verify credit_ledger UNIQUE constraint works
- [ ] Verify wallet balance calculations
- [ ] Feature flag: referral_program_enabled (default=false)

### Deployment Steps
1. Deploy code to staging
2. Run database migration
3. Hook webhook handler
4. Enable feature flag
5. Smoke tests
6. Deploy to production
7. Monitor metrics

---

## 🔧 Configuration Reference

All values editable via admin API:

| Field | Default | Type | Notes |
|-------|---------|------|-------|
| `token_per_qualified_referee` | 500 | int | Tokens awarded per referral |
| `token_to_price_reduction_percent` | 0.2 | decimal | % per token for price discount |
| `token_to_app_increase` | 0.1 | decimal | Apps per token (1 app per 10 tokens) |
| `max_tokens_per_renewal` | 5000 | int | Cap tokens per renewal |
| `hold_period_days` | 7 | int | Lock-up period after qualification |
| `enabled` | true | bool | Global enable/disable |

---

## 📞 Troubleshooting

### Issue: Tokens not awarded
**Solution:** Check:
1. Referral status is PENDING before webhook
2. Razorpay webhook is firing (check logs)
3. ReferralWebhookService.onSubscriptionActivated is being called
4. credit_ledger has entry with reason=REFERRAL_EARNED

### Issue: Double tokens awarded
**Solution:** Check:
1. credit_ledger UNIQUE (reason, ref_id, user_id) constraint exists
2. Webhook handler is idempotent (checks existing entry first)

### Issue: Wallet balance incorrect
**Solution:** Recalculate:
```sql
SELECT user_id,
  SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) as earned,
  SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) as spent
FROM credit_ledger
WHERE user_id = 'user-id'
GROUP BY user_id;
```

---

## 📚 Additional Resources

See accompanying documentation:
- `PHASE_6_SPEC.md` — Complete technical specification
- `PHASE_6_BUILD_GUIDE.md` — Implementation guide
- `PHASE_6_IMPLEMENTATION_SUMMARY.md` — Example flows with numbers
- `PHASE_6_START_HERE.md` — Quick overview

---

**Phase 6 Implementation Complete**  
**October 2, 2026**  
**Production Ready ✅**
