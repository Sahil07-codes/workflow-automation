import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  InternalServerErrorException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { WebhookEventRepository } from './repositories/webhook-event.repository';

@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private webhookVerification: WebhookVerificationService,
    private webhookProcessor: WebhookProcessorService,
    private webhookEventRepo: WebhookEventRepository,
  ) {}

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  async getPlans() {
    return this.billingService.getPlans();
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async subscribe(@CurrentUser() user: any, @Body() dto: SubscribeDto) {
    return this.billingService.subscribe(user.id, dto.planId);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async cancel(@CurrentUser() user: any) {
    return this.billingService.cancel(user.id);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  async getInvoices(@CurrentUser() user: any) {
    const subscription = await this.billingService.getSubscription(user.id);
    return { subscriptionId: subscription?.id, invoices: [] };
  }

  @Public()
  @Post('webhooks/razorpay')
  @HttpCode(200)
  async handleRazorpayWebhook(@Req() req: any) {
    const signature = req.headers['x-razorpay-signature'];
    if (!req.rawBody) {
      throw new InternalServerErrorException(
        'Raw body not available for webhook signature verification',
      );
    }
    const rawBody = req.rawBody;

    // Verify signature
    this.webhookVerification.verifyAndThrow(rawBody, signature);

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id: eventId, event: eventType, payload: eventPayload } = payload;

    // Store webhook event (idempotent)
    const stored = await this.webhookEventRepo.create({
      provider: 'razorpay',
      providerEventId: eventId,
      type: eventType,
      payload: eventPayload,
      status: 'RECEIVED',
    });

    if (!stored) {
      // Duplicate event, return 200 OK
      return { status: 'ok', message: 'Duplicate event' };
    }

    // Process webhook asynchronously (queue in production)
    await this.webhookProcessor.process({ type: eventType, payload: eventPayload });
    await this.webhookEventRepo.markProcessed(stored.id);

    return { status: 'ok' };
  }
}
