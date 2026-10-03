import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RazorpayClientService } from './services/razorpay-client.service';
import { SubscriptionService } from './services/subscription.service';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { EntitlementService } from './services/entitlement.service';
import { InvoiceService } from './services/invoice.service';
import { DunningService } from './services/dunning.service';
import { PlanRepository } from './repositories/plan.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { InvoiceRepository } from './repositories/invoice.repository';
import { WebhookEventRepository } from './repositories/webhook-event.repository';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    RazorpayClientService,
    SubscriptionService,
    WebhookVerificationService,
    WebhookProcessorService,
    EntitlementService,
    InvoiceService,
    DunningService,
    PlanRepository,
    SubscriptionRepository,
    PaymentRepository,
    InvoiceRepository,
    WebhookEventRepository,
    PrismaService,
  ],
  exports: [EntitlementService, SubscriptionService, BillingService],
})
export class BillingModule {}
