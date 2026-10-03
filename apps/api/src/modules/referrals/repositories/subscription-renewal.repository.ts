import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SubscriptionRenewalRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOwnedSubscription(subscriptionId: string, userId: string) {
    return this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { plan: true, renewalOption: true },
    });
  }

  findUpcomingSubscriptions(userId: string, days: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: now, lte: cutoff },
      },
      include: { plan: true, renewalOption: true },
      orderBy: { currentPeriodEnd: 'asc' },
    });
  }

  ensureRenewalOption(subscriptionId: string, renewalAt: Date, tokensAvailable: number) {
    return this.prisma.subscription_renewal_options.upsert({
      where: { subscription_id: subscriptionId },
      create: { subscription_id: subscriptionId, renewal_at: renewalAt, tokens_available: tokensAvailable },
      update: { renewal_at: renewalAt, tokens_available: tokensAvailable },
    });
  }

  updateRedemption(
    subscriptionId: string,
    option: string,
    tokensRedeemed: number,
    data: { discount_paise?: number; app_increase?: number },
  ) {
    return this.prisma.subscription_renewal_options.updateMany({
      where: { subscription_id: subscriptionId, chosen_option: null },
      data: {
        chosen_option: option,
        tokens_redeemed: tokensRedeemed,
        discount_amount_paise: data.discount_paise,
        app_increase: data.app_increase,
        updated_at: new Date(),
      },
    });
  }
}
