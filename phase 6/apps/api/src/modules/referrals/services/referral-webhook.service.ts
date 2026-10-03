import { Injectable, Logger } from '@nestjs/common';
import { ReferralService } from './referral.service';

@Injectable()
export class ReferralWebhookService {
  private logger = new Logger(ReferralWebhookService.name);

  constructor(private referralService: ReferralService) {}

  async onSubscriptionActivated(userId: string): Promise<void> {
    try {
      await this.referralService.qualifyReferral(userId);
      this.logger.log(`Subscription activated for user: ${userId}, referral qualified`);
    } catch (error) {
      this.logger.error(`Error qualifying referral for user ${userId}:`, error);
    }
  }
}
