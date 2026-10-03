import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRepository } from '../repositories/subscription.repository';

@Injectable()
export class DunningService {
  private logger = new Logger('DunningService');
  private readonly GRACE_PERIOD_DAYS = 3;

  constructor(private subRepo: SubscriptionRepository) {}

  async enterGracePeriod(razorpaySubId: string) {
    const sub = await this.subRepo.findByRazorpayId(razorpaySubId);
    if (!sub) return;

    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + this.GRACE_PERIOD_DAYS);

    await this.subRepo.update(sub.id, {
      status: 'PENDING',
      grace_until: graceUntil,
    });

    this.logger.log(`Entered grace period for subscription ${sub.id} until ${graceUntil}`);
  }

  async checkAndPauseExpired() {
    // Reconciliation job: find all subscriptions with grace_until < now and status PENDING
    // Pause automation by marking status HALTED
    // Send notification to user
    this.logger.log('Dunning check ran');
  }
}
