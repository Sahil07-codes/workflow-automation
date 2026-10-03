import { Injectable } from '@nestjs/common';
import { SubscriptionService } from './services/subscription.service';
import { PlanRepository } from './repositories/plan.repository';

@Injectable()
export class BillingService {
  constructor(
    private subscriptionService: SubscriptionService,
    private planRepo: PlanRepository,
  ) {}

  async getPlans() {
    return this.planRepo.findAll();
  }

  async subscribe(userId: string, planId: string) {
    return this.subscriptionService.createSubscription(userId, planId);
  }

  async cancel(userId: string) {
    return this.subscriptionService.cancelSubscription(userId);
  }

  async getSubscription(userId: string) {
    return this.subscriptionService.getSubscription(userId);
  }
}
