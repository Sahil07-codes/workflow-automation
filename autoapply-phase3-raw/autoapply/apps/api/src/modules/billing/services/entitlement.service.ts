import { Injectable } from '@nestjs/common';
import { SubscriptionRepository } from '../repositories/subscription.repository';

@Injectable()
export class EntitlementService {
  constructor(private subRepo: SubscriptionRepository) {}

  async canSubmitApplication(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await this.subRepo.findByUserId(userId);

    if (!sub) {
      return { allowed: false, reason: 'No active subscription' };
    }

    if (sub.status !== 'ACTIVE') {
      return { allowed: false, reason: `Subscription status: ${sub.status}` };
    }

    if (sub.current_period_end && new Date() > sub.current_period_end) {
      return { allowed: false, reason: 'Subscription period expired' };
    }

    // TODO: Check daily cap and monthly quota against application count

    return { allowed: true };
  }

  async getEntitlements(userId: string) {
    const sub = await this.subRepo.findByUserId(userId);
    if (!sub) return { dailyCap: 5, monthlyQuota: 5, status: 'NONE' };

    return {
      status: sub.status,
      dailyCap: 25, // Default, read from plan in production
      monthlyQuota: 100, // Default
      currentPeriodEnd: sub.current_period_end,
    };
  }
}
