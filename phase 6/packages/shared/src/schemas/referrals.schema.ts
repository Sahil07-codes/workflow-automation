import { z } from 'zod';

export const ReferralStatusEnum = z.enum([
  'PENDING',
  'QUALIFIED',
  'REWARDED',
  'REJECTED',
  'REVERSED',
]);

export const CreditReasonEnum = z.enum([
  'REFERRAL_EARNED',
  'PURCHASE',
  'APPLICATION_BONUS',
  'PRICE_DISCOUNT',
  'APP_INCREASE',
  'REFUND',
]);

export const RedemptionOptionEnum = z.enum(['PRICE_DISCOUNT', 'APP_INCREASE']);

export const ReferralStatsSchema = z.object({
  referral_code: z.string().nullable(),
  total_referrals: z.number(),
  qualified_referrals: z.number(),
  pending_referrals: z.number(),
  tokens_earned: z.number(),
  tokens_available: z.number(),
});

export const WalletSchema = z.object({
  total_earned: z.number(),
  total_spent: z.number(),
  balance: z.number(),
});

export const RenewalOptionsSchema = z.object({
  subscription_id: z.string(),
  tokens_available: z.number(),
  price_discount_option: z.object({
    tokens_needed: z.number(),
    discount_percent: z.number(),
    discount_paise: z.number(),
    original_price_paise: z.number(),
    new_price_paise: z.number(),
  }),
  app_increase_option: z.object({
    tokens_needed: z.number(),
    app_increase: z.number(),
    new_monthly_quota: z.number(),
  }),
});

export const RedeemTokensSchema = z.object({
  option: RedemptionOptionEnum,
  tokens_to_redeem: z.number().int().min(1),
});

export const ReferralConfigSchema = z.object({
  token_per_qualified_referee: z.number().int().min(1),
  token_to_price_reduction_percent: z.number().min(0).max(100),
  token_to_app_increase: z.number().min(0),
  max_tokens_per_renewal: z.number().int(),
  hold_period_days: z.number().int().min(0),
  enabled: z.boolean(),
});
