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

    const razorpaySub = await this.razorpay.createSubscription(plan.razorpay_plan_id || planId);

    return this.subRepo.create({
      user_id: userId,
      plan_id: planId,
      razorpay_sub_id: razorpaySub.id,
      status: 'CREATED',
    });
  }

  async cancelSubscription(userId: string) {
    const sub = await this.subRepo.findByUserId(userId);
    if (!sub) throw new Error('No subscription found');

    await this.razorpay.cancelSubscription(sub.razorpay_sub_id || '');
    return this.subRepo.update(sub.id, { status: 'CANCELLED' });
  }

  async getSubscription(userId: string) {
    return this.subRepo.findByUserId(userId);
  }
}
