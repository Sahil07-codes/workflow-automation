import { Injectable } from '@nestjs/common';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PlanRepository } from '../repositories/plan.repository';
import { RazorpayClientService } from './razorpay-client.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private subRepo: SubscriptionRepository,
    private planRepo: PlanRepository,
    private razorpay: RazorpayClientService,
  ) {}

  async createSubscription(userId: string, planId: string) {
    const plan = await this.planRepo.findById(planId);
    if (!plan) throw new Error('Plan not found');

    const razorpaySub = await this.razorpay.createSubscription(
      plan.razorpayPlanId || planId,
    );

    const subscription = await this.subRepo.create({
      userId,
      planId,
      razorpaySubId: razorpaySub.id,
      status: 'CREATED',
    });
    return {
      ...subscription,
      checkout_url: razorpaySub.short_url,
    };
  }

  async cancelSubscription(userId: string) {
    const sub = await this.subRepo.findByUserId(userId);
    if (!sub) throw new Error('No subscription found');

    await this.razorpay.cancelSubscription(sub.razorpaySubId || '');
    return this.subRepo.update(sub.id, { status: 'CANCELLED' });
  }

  async getSubscription(userId: string) {
    return this.subRepo.findByUserId(userId);
  }
}
