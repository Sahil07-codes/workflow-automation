import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { SubscriptionService } from './services/subscription.service';
import { PlanRepository } from './repositories/plan.repository';

describe('BillingService', () => {
  let service: BillingService;
  let subscriptionService: SubscriptionService;
  let planRepository: PlanRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: SubscriptionService,
          useValue: { createSubscription: jest.fn() },
        },
        {
          provide: PlanRepository,
          useValue: { findAll: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    subscriptionService = module.get<SubscriptionService>(SubscriptionService);
    planRepository = module.get<PlanRepository>(PlanRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get all plans', async () => {
    const mockPlans = [{ id: 'plan1', name: 'Pro', price_paise: 99900 }];
    jest.spyOn(planRepository, 'findAll').mockResolvedValue(mockPlans);

    const result = await service.getPlans();
    expect(result).toEqual(mockPlans);
  });

  it('should subscribe user to plan', async () => {
    const userId = 'user123';
    const planId = 'plan1';
    const mockSub = { id: 'sub123', user_id: userId, plan_id: planId, status: 'CREATED' };

    jest.spyOn(subscriptionService, 'createSubscription').mockResolvedValue(mockSub);

    const result = await service.subscribe(userId, planId);
    expect(result).toEqual(mockSub);
  });
});

describe('WebhookVerificationService', () => {
  let webhookService: any;
  const mockSecret = 'test_secret';

  beforeEach(() => {
    webhookService = {
      verify: (rawBody: Buffer, signature: string) => {
        const crypto = require('crypto');
        const expected = crypto.createHmac('sha256', mockSecret).update(rawBody).digest('hex');
        try {
          return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
        } catch {
          return false;
        }
      },
    };
  });

  it('should verify valid webhook signature', () => {
    const crypto = require('crypto');
    const rawBody = Buffer.from('test_payload');
    const signature = crypto.createHmac('sha256', mockSecret).update(rawBody).digest('hex');

    const result = webhookService.verify(rawBody, signature);
    expect(result).toBe(true);
  });

  it('should reject invalid webhook signature', () => {
    const rawBody = Buffer.from('test_payload');
    const invalidSignature = 'invalid_signature';

    const result = webhookService.verify(rawBody, invalidSignature);
    expect(result).toBe(false);
  });
});
