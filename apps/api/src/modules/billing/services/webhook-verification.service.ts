import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookVerificationService {
  private webhookSecret: string;

  constructor(private config: ConfigService) {
    this.webhookSecret =
      this.config.get<string>('razorpay_webhook_secret', { infer: true }) ?? '';
    if (!this.webhookSecret) {
      throw new Error('razorpay_webhook_secret is not configured');
    }
  }

  verify(rawBody: Buffer, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  verifyAndThrow(rawBody: Buffer, signature: string): void {
    if (!this.verify(rawBody, signature)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }
}
