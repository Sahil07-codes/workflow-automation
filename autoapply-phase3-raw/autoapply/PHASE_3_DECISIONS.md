# AutoApply Phase 3 (Billing) — Build Decisions

**Date:** October 1, 2026  
**Scope:** Razorpay subscriptions, webhooks, dunning, invoicing, entitlements

---

## Implemented Decisions

### D1: Razorpay Integration
- **Decision:** Use Razorpay Hosted Checkout (PCI scope: SAQ A)
- **Implementation:** `RazorpayClientService` wraps API calls; no card data touches our servers
- **Location:** `apps/api/src/modules/billing/services/razorpay-client.service.ts`

### D2: Webhook Signature Verification
- **Decision:** Verify `X-Razorpay-Signature` using HMAC-SHA256 + constant-time compare
- **Requirement:** Raw body needed for verification (Nest receives with `rawBody: true`)
- **Implementation:** `WebhookVerificationService` with `timingSafeEqual`
- **Location:** `apps/api/src/modules/billing/services/webhook-verification.service.ts`

### D3: Idempotent Webhook Processing
- **Decision:** `UNIQUE(provider, provider_event_id)` on `webhook_events` table
- **Duplicate Event Handling:** Duplicate insert = ignored; return 200 OK to Razorpay
- **Implementation:** Repository catches `P2002` (unique constraint), returns null
- **Location:** `apps/api/src/modules/billing/repositories/webhook-event.repository.ts`

### D4: Subscription Status Machine
- **States:** CREATED → ACTIVE → PENDING (grace) → HALTED or back to ACTIVE
- **Events Handled:**
  - `subscription.activated` → status = ACTIVE
  - `subscription.charged` → record payment + generate invoice + renew quota
  - `payment.failed` / `subscription.pending` → enter grace period (3 days)
  - `subscription.halted` → status = HALTED (pause automation)
  - `subscription.cancelled` / `completed` → status = CANCELLED
  - `refund.processed` → payment status = REFUNDED
- **Location:** `apps/api/src/modules/billing/services/webhook-processor.service.ts`

### D5: Entitlement Service
- **Purpose:** Single source of truth for "can this user submit an application?"
- **Checks:**
  - Subscription status = ACTIVE
  - Current period not expired
  - Daily cap and monthly quota (TODO: count applications)
- **Used By:** Phase 5+ before every submit
- **Location:** `apps/api/src/modules/billing/services/entitlement.service.ts`

### D6: Invoice Generation
- **Approach:** Generate invoice on every successful `subscription.charged` webhook
- **Fields:** invoice_no (unique), GSTIN, taxable amount, GST amount (18%)
- **PDF:** S3 key stored; PDF generation post-Phase 3
- **Location:** `apps/api/src/modules/billing/services/invoice.service.ts`

### D7: Dunning (Grace Period)
- **Flow:** Payment fails → set grace_until = now + 3 days, status = PENDING
- **Notifications:** Day 0, 2, 4 (via queue in production)
- **Expiry:** After grace_until, reconciliation job pauses automation (status = HALTED)
- **Data Retention:** User data never deleted (DPDP compliant)
- **Location:** `apps/api/src/modules/billing/services/dunning.service.ts`

### D8: Module Structure
- **Repositories:** 5 (Plan, Subscription, Payment, Invoice, WebhookEvent)
- **Services:** 7 (Razorpay, Subscription, WebhookVerification, WebhookProcessor, Entitlement, Invoice, Dunning)
- **Controller:** 5 endpoints (GET /plans, POST /subscribe, POST /cancel, GET /invoices, POST /webhooks/razorpay)
- **No Cross-Module Dependencies:** Billing only depends on Prisma + Config

### D9: Configuration
- **New Env Variables:** RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
- **Added to:** `.env.example`, should be added to Joi schema in `common/config/configuration.ts`
- **Test Mode:** Use Razorpay test credentials (rzp_test_*)

### D10: Database Schema
- **New Tables:** Plan, Subscription, Payment, Invoice, WebhookEvent
- **Migrations:** Single SQL file under `prisma/migrations/phase3_billing/`
- **Indexes:** On Subscription(user_id), Payment(user_id), WebhookEvent(provider, provider_event_id)
- **Unique Constraints:** Subscription(razorpay_sub_id), Payment(razorpay_payment_id), Invoice(invoice_no)

---

## Pending for Phase 3+

### Invoice PDF Generation
- Requires Razorpay Invoice API or internal PDF library (pdfkit, reportlab)
- S3 integration for storing PDFs
- Email delivery via SES

### Dunning Notifications
- Email templates for grace period reminders (day 0, 2, 4)
- SMS fallback via MSG91 (if SMS OTP working)
- WhatsApp integration (optional)

### Reconciliation Job
- Cron job to reconcile our subscription state vs Razorpay API
- Detects missed webhooks, out-of-order events
- Scheduled via Phase 5 worker pool

### Plan Management UI
- Admin interface to create/edit/delete plans
- Razorpay Plan ID sync

### Billing Dashboard
- User-facing subscription status, invoice list, payment history
- Admin analytics (MRR, churn, dunning recoveries)

---

## Testing Strategy

### Unit Tests
- ✅ BillingService (get plans, subscribe, cancel)
- ✅ WebhookVerificationService (valid/invalid signatures)
- ✅ SubscriptionService (create, fetch)
- ✅ EntitlementService (can submit checks)

### Integration Tests (Phase 3.5)
- Razorpay webhook fixtures (subscription.activated, payment.failed, etc.)
- Idempotent duplicate event handling
- Out-of-order event state machine

### E2E Tests (Phase 3.5)
- Full subscribe → activate → charge cycle
- Failed payment → grace period → recovery flow
- Invoice generation + delivery

---

## Known Limitations

1. **Razorpay Client:** Mocked (no actual API calls). Wire up real SDK when AWS credentials available.
2. **Invoice PDF:** Not generated; placeholder S3 key only.
3. **Dunning Notifications:** Logged only; full mailer not wired.
4. **Reconciliation:** Scheduled job scaffolded, not implemented.
5. **Quote/Quota Tracking:** Application count not yet tracked against daily_cap + monthly_quota.

---

## Integration Points with Other Phases

### Phase 5 (Automation Engine)
- Must call `EntitlementService.canSubmitApplication(userId)` before every submit
- Check result.allowed before proceeding
- Return entitlements to Phase 5 worker

### Phase 6 (Referrals)
- Credits issued from `credit_ledger` tied to subscription (future)
- Billing does not manage credits yet; Phase 6 only

### Phase 9-10 (Extension/Dummy Account)
- Subscription status governs whether browser automation runs
- Halted subscription = auto-pause extension (future logic)

---

## Security Checklist

- [x] Webhook signature verification (HMAC-SHA256, constant-time compare)
- [x] Idempotent webhook processing (UNIQUE constraint + explicit handling)
- [x] No card data in our systems (Razorpay Hosted Checkout)
- [x] Server-side price/plan resolution (no client-side price changes)
- [x] Rate limiting ready (Phase 5 applies to /subscribe endpoint)
- [x] Audit logging ready (`webhook_events` table + admin_audit_log in future)

---

## Cost Model Notes

- **Per-application variable cost:** SMS + email + browser + LLM (billed separately)
- **Billing infrastructure cost:** Razorpay 2% + payment gateway fee + SMS
- **Target gross margin:** 70%+ after COGS

---

**End of Phase 3 Decisions**
