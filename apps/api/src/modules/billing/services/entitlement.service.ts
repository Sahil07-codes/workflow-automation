import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationState } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionRepository } from '../repositories/subscription.repository';

@Injectable()
export class EntitlementService {
  constructor(
    private readonly subRepo: SubscriptionRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canSubmitApplication(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    if (this.config.get<boolean>('subscription_bypass', true)) {
      return { allowed: true };
    }

    const subscription = await this.subRepo.findByUserId(userId);
    if (!subscription) return { allowed: false, reason: 'No active subscription' };
    if (subscription.status !== 'ACTIVE') {
      return { allowed: false, reason: `Subscription status: ${subscription.status}` };
    }

    const now = new Date();
    if (subscription.currentPeriodEnd && now > subscription.currentPeriodEnd) {
      return { allowed: false, reason: 'Subscription period expired' };
    }

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const countableStates = {
      notIn: [ApplicationState.FAILED, ApplicationState.REJECTED],
    };
    const [todayCount, monthCount] = await Promise.all([
      this.prisma.application.count({
        where: { userId, state: countableStates, createdAt: { gte: dayStart } },
      }),
      this.prisma.application.count({
        where: { userId, state: countableStates, createdAt: { gte: monthStart } },
      }),
    ]);

    const dailyCap = subscription.plan.dailyCap;
    const monthlyQuota =
      subscription.plan.monthlyQuota + (subscription.renewalOption?.app_increase ?? 0);
    if (todayCount >= dailyCap) {
      return { allowed: false, reason: 'Daily application limit reached' };
    }
    if (monthCount >= monthlyQuota) {
      return { allowed: false, reason: 'Monthly application quota reached' };
    }
    return { allowed: true };
  }

  async getEntitlements(userId: string) {
    const subscription = await this.subRepo.findByUserId(userId);
    if (!subscription) {
      return { dailyCap: 0, monthlyQuota: 0, status: 'NONE' };
    }
    return {
      status: subscription.status,
      dailyCap: subscription.plan.dailyCap,
      monthlyQuota:
        subscription.plan.monthlyQuota + (subscription.renewalOption?.app_increase ?? 0),
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }
}
