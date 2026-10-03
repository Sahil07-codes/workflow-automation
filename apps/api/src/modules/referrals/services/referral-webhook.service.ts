import { Injectable, Logger } from '@nestjs/common';
import { ReferralService } from './referral.service';

@Injectable()
export class ReferralWebhookService {
  private logger = new Logger(ReferralWebhookService.name);

  constructor(private referralService: ReferralService) {}

  async onSubscriptionActivated(userId: string): Promise<void> {
    await this.referralService.qualifyReferral(userId);
    this.logger.log(`Referral qualification processed for user: ${userId}`);
  }
}
