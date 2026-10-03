import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditLedgerService } from './credit-ledger.service';
import { SubscriptionRenewalRepository } from '../repositories/subscription-renewal.repository';
import { ReferralConfigService } from './referral-config.service';

@Injectable()
export class SubscriptionRenewalService {
  constructor(
    private readonly renewalRepo: SubscriptionRenewalRepository,
    private readonly creditLedger: CreditLedgerService,
    private readonly configService: ReferralConfigService,
  ) {}

  async detectUpcomingRenewals(days = 7): Promise<void> {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new RangeError('Renewal scan days must be between 1 and 90');
    }
  }

  async getRenewalOptions(subscriptionId: string, userId: string) {
    const subscription = await this.renewalRepo.findOwnedSubscription(subscriptionId, userId);
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status !== 'ACTIVE') {
      throw new ForbiddenException('Renewal options require an active subscription');
    }

    const [balance, config] = await Promise.all([
      this.creditLedger.getBalance(userId),
      this.configService.getConfig(),
    ]);
    const available = Math.min(balance.balance, config.max_tokens_per_renewal);
    const renewalAt = subscription.currentPeriodEnd ?? new Date();
    const renewal = await this.renewalRepo.ensureRenewalOption(
      subscriptionId,
      renewalAt,
      available,
    );
    if (renewal.chosen_option) {
      return {
        subscription_id: subscriptionId,
        tokens_available: renewal.tokens_available,
        chosen_option: renewal.chosen_option,
        tokens_redeemed: renewal.tokens_redeemed,
      };
    }
    if (available <= 0) {
      return {
        subscription_id: subscriptionId,
        tokens_available: 0,
        price_discount_option: null,
        app_increase_option: null,
      };
    }

    const discountPercent = Math.min(
      100,
      available * config.token_to_price_reduction_percent,
    );
    const discountPaise = Math.floor(
      (subscription.plan.pricePaise * discountPercent) / 100,
    );
    const appIncrease = Math.floor(available * config.token_to_app_increase);
    return {
      subscription_id: subscriptionId,
      tokens_available: available,
      price_discount_option: {
        tokens_needed: available,
        discount_percent: discountPercent,
        discount_paise: discountPaise,
        original_price_paise: subscription.plan.pricePaise,
        new_price_paise: subscription.plan.pricePaise - discountPaise,
      },
      app_increase_option: {
        tokens_needed: available,
        app_increase: appIncrease,
        new_monthly_quota: subscription.plan.monthlyQuota + appIncrease,
      },
    };
  }

  async getUpcomingRenewals(userId: string): Promise<unknown[]> {
    const subscriptions = await this.renewalRepo.findUpcomingSubscriptions(userId, 7);
    return Promise.all(
      subscriptions.map((subscription) =>
        this.getRenewalOptions(subscription.id, userId),
      ),
    );
  }
}
