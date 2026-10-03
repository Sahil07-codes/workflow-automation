import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { DunningService } from './dunning.service';
import { InvoiceService } from './invoice.service';

@Injectable()
export class WebhookProcessorService {
  private logger = new Logger('WebhookProcessor');

  constructor(
    private subRepo: SubscriptionRepository,
    private paymentRepo: PaymentRepository,
    private invoiceRepo: InvoiceRepository,
    private dunning: DunningService,
    private invoiceService: InvoiceService,
  ) {}

  async process(event: any): Promise<void> {
    const { type, payload } = event;

    switch (type) {
      case 'subscription.activated':
        await this.handleActivated(payload);
        break;
      case 'subscription.charged':
        await this.handleCharged(payload);
        break;
      case 'payment.failed':
      case 'subscription.pending':
        await this.dunning.enterGracePeriod(payload.subscription.id);
        break;
      case 'subscription.halted':
        await this.handleHalted(payload);
        break;
      case 'subscription.cancelled':
      case 'subscription.completed':
        await this.subRepo.update(payload.subscription.id, { status: 'CANCELLED' });
        break;
      case 'refund.processed':
        await this.handleRefund(payload);
        break;
    }

    this.logger.log(`Processed event: ${type}`);
  }

  private async handleActivated(payload: any) {
    const sub = await this.subRepo.findByRazorpayId(payload.subscription.id);
    if (sub) {
      await this.subRepo.update(sub.id, { status: 'ACTIVE', updated_at: new Date() });
    }
  }

  private async handleCharged(payload: any) {
    const sub = await this.subRepo.findByRazorpayId(payload.subscription.id);
    if (!sub) return;

    await this.paymentRepo.create({
      user_id: sub.user_id,
      subscription_id: sub.id,
      razorpay_payment_id: payload.payment.id,
      amount_paise: payload.payment.amount,
      status: 'CAPTURED',
    });

    await this.invoiceService.generateInvoice(sub.user_id, payload.payment.amount);
    await this.subRepo.update(sub.id, { status: 'ACTIVE' });
  }

  private async handleHalted(payload: any) {
    const sub = await this.subRepo.findByRazorpayId(payload.subscription.id);
    if (sub) {
      await this.subRepo.update(sub.id, { status: 'HALTED' });
    }
  }

  private async handleRefund(payload: any) {
    const payment = await this.paymentRepo.findByRazorpayId(payload.payment.id);
    if (payment) {
      await this.paymentRepo.update(payment.id, { status: 'REFUNDED' });
    }
  }
}
