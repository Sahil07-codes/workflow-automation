import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreditLedgerService } from './credit-ledger.service';
import { SubscriptionRenewalRepository } from '../repositories/subscription-renewal.repository';
import { ReferralConfigService } from './referral-config.service';

@Injectable()
export class TokenRedemptionService {
  private logger = new Logger(TokenRedemptionService.name);

  constructor(
    private creditLedger: CreditLedgerService,
    private renewalRepo: SubscriptionRenewalRepository,
    private configService: ReferralConfigService,
  ) {}

  async applyRedemption(
    subscriptionId: string,
    userId: string,
    option: string,
    tokens: number,
  ): Promise<any> {
    if (!['PRICE_DISCOUNT', 'APP_INCREASE'].includes(option)) {
      throw new BadRequestException('Invalid option. Must be PRICE_DISCOUNT or APP_INCREASE');
    }

    const config = await this.configService.getConfig();
    if (tokens > config.max_tokens_per_renewal) {
      throw new BadRequestException(`Cannot redeem more than ${config.max_tokens_per_renewal} tokens`);
    }

    // Deduct tokens
    await this.creditLedger.spend(userId, tokens, option, subscriptionId);

    if (option === 'PRICE_DISCOUNT') {
      const discountPercent = tokens * config.token_to_price_reduction_percent;
      const planPrice = 99900; // ₹999 in paise
      const discountPaise = Math.floor((planPrice * discountPercent) / 100);
      const newPrice = planPrice - discountPaise;

      await this.renewalRepo.updateRedemption(subscriptionId, 'PRICE_DISCOUNT', tokens, {
        discount_paise: discountPaise,
        new_price_paise: newPrice,
      });

      this.logger.log(
        `Token redemption: ${userId} redeemed ${tokens} tokens for ₹${(discountPaise / 100).toFixed(2)} discount`,
      );

      return {
        option: 'PRICE_DISCOUNT',
        tokens_redeemed: tokens,
        discount_paise: discountPaise,
        new_price_paise: newPrice,
      };
    }

    if (option === 'APP_INCREASE') {
      const appIncrease = Math.floor(tokens * config.token_to_app_increase);

      await this.renewalRepo.updateRedemption(subscriptionId, 'APP_INCREASE', tokens, {
        app_increase: appIncrease,
      });

      this.logger.log(`Token redemption: ${userId} redeemed ${tokens} tokens for +${appIncrease} apps`);

      return {
        option: 'APP_INCREASE',
        tokens_redeemed: tokens,
        app_increase: appIncrease,
        new_monthly_quota: 100 + appIncrease,
      };
    }
  }
}
