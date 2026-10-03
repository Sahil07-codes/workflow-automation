import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SubscriptionRenewalRepository {
  constructor(private prisma: PrismaService) {}

  async create(subscriptionId: string, renewalAt: Date, tokensAvailable: number): Promise<any> {
    return this.prisma.subscription_renewal_options.create({
      data: {
        subscription_id: subscriptionId,
        renewal_at: renewalAt,
        tokens_available: tokensAvailable,
      },
    });
  }

  async findUpcoming(days: number): Promise<any[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.subscription_renewal_options.findMany({
      where: {
        renewal_at: { gte: now, lte: futureDate },
        chosen_option: null,
      },
    });
  }

  async updateRedemption(
    subscriptionId: string,
    option: string,
    tokensRedeemed: number,
    data: any,
  ): Promise<any> {
    return this.prisma.subscription_renewal_options.update({
      where: { subscription_id: subscriptionId },
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
