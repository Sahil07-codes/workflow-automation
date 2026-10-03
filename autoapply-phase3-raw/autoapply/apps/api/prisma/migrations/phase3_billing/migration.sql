-- ============ BILLING TABLES (Phase 3) ============

CREATE TABLE IF NOT EXISTS "plans" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "razorpay_plan_id" TEXT,
  "price_paise" INTEGER NOT NULL,
  "monthly_quota" INTEGER NOT NULL,
  "daily_cap" INTEGER NOT NULL,
  "features" JSONB,
  "active" BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL REFERENCES "plans"("id"),
  "razorpay_sub_id" TEXT UNIQUE,
  "status" TEXT NOT NULL,
  "current_period_end" TIMESTAMP,
  "grace_until" TIMESTAMP,
  "cancel_at_period_end" BOOLEAN DEFAULT false,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions"("user_id");

CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" TEXT NOT NULL,
  "subscription_id" TEXT REFERENCES "subscriptions"("id"),
  "razorpay_payment_id" TEXT UNIQUE NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "currency" TEXT DEFAULT 'INR',
  "status" TEXT NOT NULL,
  "method" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "payment_id" TEXT REFERENCES "payments"("id"),
  "invoice_no" TEXT UNIQUE NOT NULL,
  "gstin" TEXT,
  "taxable_paise" INTEGER,
  "gst_paise" INTEGER,
  "pdf_key" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "provider" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT DEFAULT 'RECEIVED',
  "received_at" TIMESTAMP DEFAULT now(),
  "processed_at" TIMESTAMP,
  UNIQUE("provider", "provider_event_id")
);

-- ============ END BILLING TABLES ============
