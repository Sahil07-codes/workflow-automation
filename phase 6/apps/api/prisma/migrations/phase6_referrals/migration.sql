-- ============ REFERRALS (Phase 6) ============

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  referred_at TIMESTAMPTZ DEFAULT now(),
  qualification_event TEXT,
  qualified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED', 'REVERSED')),
  fraud_flags JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('REFERRAL_EARNED', 'PURCHASE', 'APPLICATION_BONUS', 'PRICE_DISCOUNT', 'APP_INCREASE', 'REFUND')),
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reason, ref_id, user_id)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_earned INT NOT NULL DEFAULT 0,
  total_spent INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_config (
  id INT PRIMARY KEY DEFAULT 1,
  token_per_qualified_referee INT DEFAULT 500,
  token_to_price_reduction_percent DECIMAL(5,2) DEFAULT 0.2,
  token_to_app_increase DECIMAL(5,2) DEFAULT 0.1,
  max_tokens_per_renewal INT DEFAULT 5000,
  hold_period_days INT DEFAULT 7,
  enabled BOOL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_renewal_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL UNIQUE REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_at TIMESTAMPTZ NOT NULL,
  tokens_available INT NOT NULL,
  chosen_option TEXT CHECK (chosen_option IS NULL OR chosen_option IN ('PRICE_DISCOUNT', 'APP_INCREASE')),
  tokens_redeemed INT DEFAULT 0,
  discount_amount_paise INT,
  app_increase INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_renewal_subscription_id ON subscription_renewal_options(subscription_id);
