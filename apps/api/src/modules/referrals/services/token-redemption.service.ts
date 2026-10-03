import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { ReferralConfigService } from './referral-config.service';

type RedemptionOption = 'PRICE_DISCOUNT' | 'APP_INCREASE';

@Injectable()
export class TokenRedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ReferralConfigService,
  ) {}

  async applyRedemption(
    subscriptionId: string,
    userId: string,
    option: RedemptionOption,
    tokens: number,
  ) {
    if (!Number.isSafeInteger(tokens) || tokens < 1) {
      throw new BadRequestException('Tokens to redeem must be a positive integer');
    }
    if (!['PRICE_DISCOUNT', 'APP_INCREASE'].includes(option)) {
      throw new BadRequestException('Invalid redemption option');
    }
    const config = await this.configService.getConfig();
    if (tokens > config.max_tokens_per_renewal) {
      throw new BadRequestException(
        `Cannot redeem more than ${config.max_tokens_per_renewal} tokens`,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const subscription = await transaction.subscription.findFirst({
        where: { id: subscriptionId, userId, status: 'ACTIVE' },
        include: { plan: true },
      });
      if (!subscription) throw new NotFoundException('Active subscription not found');

      await transaction.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId },
        update: {},
      });
      await transaction.$queryRaw`
        SELECT user_id FROM wallets
        WHERE user_id = CAST(${userId} AS UUID)
        FOR UPDATE
      `;
      const balanceRows = await transaction.$queryRaw<Array<{ balance: bigint }>>`
        SELECT COALESCE(SUM(delta), 0)::bigint AS balance
        FROM credit_ledger
        WHERE user_id = CAST(${userId} AS UUID)
      `;
      const balance = Number(balanceRows[0]?.balance ?? 0n);
      if (tokens > balance) {
        throw new BadRequestException(`Insufficient tokens. Available: ${balance}`);
      }

      const renewalAt = subscription.currentPeriodEnd ?? new Date();
      const renewal = await transaction.subscription_renewal_options.upsert({
        where: { subscription_id: subscriptionId },
        create: {
          subscription_id: subscriptionId,
          renewal_at: renewalAt,
          tokens_available: balance,
        },
        update: { renewal_at: renewalAt, tokens_available: balance },
      });
      if (renewal.chosen_option) {
        throw new ConflictException('Tokens have already been redeemed for this renewal');
      }
      if (tokens > renewal.tokens_available) {
        throw new BadRequestException(
          `Only ${renewal.tokens_available} tokens are available for this renewal`,
        );
      }

      const discountPercent =
        option === 'PRICE_DISCOUNT'
          ? Math.min(100, tokens * config.token_to_price_reduction_percent)
          : 0;
      const discountPaise = Math.floor(
        (subscription.plan.pricePaise * discountPercent) / 100,
      );
      const appIncrease =
        option === 'APP_INCREASE'
          ? Math.floor(tokens * config.token_to_app_increase)
          : 0;
      if (option === 'APP_INCREASE' && appIncrease < 1) {
        throw new BadRequestException('Redeem more tokens to increase the monthly application quota');
      }

      const changed = await transaction.subscription_renewal_options.updateMany({
        where: { subscription_id: subscriptionId, chosen_option: null },
        data: {
          chosen_option: option,
          tokens_redeemed: tokens,
          discount_amount_paise: option === 'PRICE_DISCOUNT' ? discountPaise : null,
          app_increase: option === 'APP_INCREASE' ? appIncrease : null,
          updated_at: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Renewal choice was already recorded');
      }

      await transaction.credit_ledger.create({
        data: { user_id: userId, delta: -tokens, reason: option, ref_id: subscriptionId },
      });
      const totals = await transaction.$queryRaw<
        Array<{ earned: bigint; spent: bigint }>
      >`
        SELECT
          COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::bigint AS earned,
          COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::bigint AS spent
        FROM credit_ledger
        WHERE user_id = CAST(${userId} AS UUID)
      `;
      await transaction.wallets.update({
        where: { user_id: userId },
        data: {
          total_earned: Number(totals[0]?.earned ?? 0n),
          total_spent: Number(totals[0]?.spent ?? 0n),
          updated_at: new Date(),
        },
      });

      if (option === 'PRICE_DISCOUNT') {
        return {
          option,
          tokens_redeemed: tokens,
          discount_paise: discountPaise,
          new_price_paise: subscription.plan.pricePaise - discountPaise,
        };
      }
      return {
        option,
        tokens_redeemed: tokens,
        app_increase: appIncrease,
        new_monthly_quota: subscription.plan.monthlyQuota + appIncrease,
      };
    });
  }
}
