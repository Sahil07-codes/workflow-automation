DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_state') THEN
    CREATE TYPE application_state AS ENUM (
      'DISCOVERED',
      'MATCHED',
      'PREPARING',
      'NEEDS_INPUT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'SUBMITTING',
      'RETRYING',
      'SUBMITTED',
      'CONFIRMED',
      'REJECTED',
      'FAILED',
      'ESCALATED'
    );
  END IF;
END
$$;

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  state application_state NOT NULL DEFAULT 'DISCOVERED',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  form_schema JSONB,
  form_payload BYTEA,
  form_payload_hash TEXT,
  screenshot_url TEXT,
  submitted_screenshot_url TEXT,
  unknown_fields JSONB,
  match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  applied_at TIMESTAMPTZ(6),
  approved_at TIMESTAMPTZ(6),
  submitted_at TIMESTAMPTZ(6),
  confirmed_at TIMESTAMPTZ(6),
  last_ats_check_at TIMESTAMPTZ(6),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ(6),
  last_error_code TEXT,
  last_error_message TEXT,
  external_application_id TEXT,
  last_ats_stage TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT applications_user_id_job_id_key UNIQUE (user_id, job_id)
);

CREATE INDEX applications_user_id_state_idx ON applications(user_id, state);
CREATE INDEX applications_state_next_retry_at_idx ON applications(state, next_retry_at);
CREATE INDEX applications_confirmed_at_idx ON applications(confirmed_at);

CREATE TABLE application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX application_events_application_id_idx ON application_events(application_id);
CREATE INDEX application_events_event_type_idx ON application_events(event_type);
CREATE INDEX application_events_created_at_idx ON application_events(created_at);

CREATE TABLE form_detection_cache (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  schema JSONB NOT NULL,
  parsed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX form_detection_cache_expires_at_idx ON form_detection_cache(expires_at);

CREATE TABLE approval_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  used_at TIMESTAMPTZ(6),
  used_by_ip TEXT,
  used_by_user_agent TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX approval_tokens_expires_at_idx ON approval_tokens(expires_at);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  referred_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  qualification_event TEXT,
  qualified_at TIMESTAMPTZ(6),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED', 'REVERSED')),
  fraud_flags JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX referrals_referrer_id_idx ON referrals(referrer_id);
CREATE INDEX referrals_code_idx ON referrals(code);

CREATE TABLE credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('REFERRAL_EARNED', 'PURCHASE', 'APPLICATION_BONUS', 'PRICE_DISCOUNT', 'APP_INCREASE', 'REFUND')),
  ref_id TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (reason, ref_id, user_id)
);

CREATE INDEX credit_ledger_user_id_idx ON credit_ledger(user_id);
CREATE INDEX credit_ledger_created_at_idx ON credit_ledger(created_at DESC);

CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE referral_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_per_qualified_referee INTEGER NOT NULL DEFAULT 500,
  token_to_price_reduction_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.2,
  token_to_app_increase DECIMAL(5, 2) NOT NULL DEFAULT 0.1,
  max_tokens_per_renewal INTEGER NOT NULL DEFAULT 5000,
  hold_period_days INTEGER NOT NULL DEFAULT 7,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE subscription_renewal_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL UNIQUE REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_at TIMESTAMPTZ(6) NOT NULL,
  tokens_available INTEGER NOT NULL,
  chosen_option TEXT CHECK (chosen_option IS NULL OR chosen_option IN ('PRICE_DISCOUNT', 'APP_INCREASE')),
  tokens_redeemed INTEGER NOT NULL DEFAULT 0,
  discount_amount_paise INTEGER,
  app_increase INTEGER,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
