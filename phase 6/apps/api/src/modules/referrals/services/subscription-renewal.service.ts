import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRenewalRepository } from '../repositories/subscription-renewal.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { ReferralConfigService } from './referral-config.service';

@Injectable()
export class SubscriptionRenewalService {
  private logger = new Logger(SubscriptionRenewalService.name);

  constructor(
    private renewalRepo: SubscriptionRenewalRepository,
    private walletRepo: WalletRepository,
    private configService: ReferralConfigService,
  ) {}

  async detectUpcomingRenewals(days: number = 7): Promise<void> {
    // Placeholder: In production, query subscriptions table for renewals in next N days
    this.logger.log(`Detected upcoming renewals within ${days} days`);
  }

  async getRenewalOptions(subscriptionId: string, userId: string): Promise<any> {
    const wallet = await this.walletRepo.getWallet(userId);
    const config = await this.configService.getConfig();
    const tokens = wallet?.balance || 0;

    if (tokens === 0) {
      return {
        subscription_id: subscriptionId,
        tokens_available: 0,
        options: null,
        message: 'No tokens available',
      };
    }

    // Max tokens usable
    const tokensToUse = Math.min(tokens, config.max_tokens_per_renewal);

    // Price discount option
    const discountPercent = tokensToUse * config.token_to_price_reduction_percent;
    const planPrice = 99900; // ₹999 in paise (hardcoded for demo)
    const discountPaise = Math.floor((planPrice * discountPercent) / 100);
    const newPrice = planPrice - discountPaise;

    // App increase option
    const appIncrease = Math.floor(tokensToUse * config.token_to_app_increase);

    return {
      subscription_id: subscriptionId,
      tokens_available: tokensToUse,
      price_discount_option: {
        tokens_needed: tokensToUse,
        discount_percent: discountPercent,
        discount_paise: discountPaise,
        original_price_paise: planPrice,
        new_price_paise: newPrice,
      },
      app_increase_option: {
        tokens_needed: tokensToUse,
        app_increase: appIncrease,
        new_monthly_quota: 100 + appIncrease, // Assuming 100 base quota
      },
    };
  }

  async getUpcomingRenewals(userId: string): Promise<any[]> {
    // Placeholder: Query subscriptions for this user with renewal in next 7 days
    return [];
  }
}
