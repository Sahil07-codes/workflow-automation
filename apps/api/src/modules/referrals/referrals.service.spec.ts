import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from './services/referral.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { ReferralConfigService } from './services/referral-config.service';
import { ReferralQueueService } from './services/referral-queue.service';
import { ReferralRepository } from './repositories/referral.repository';

describe('ReferralService', () => {
  let service: ReferralService;
  let referralRepo: jest.Mocked<ReferralRepository>;
  let creditLedger: jest.Mocked<CreditLedgerService>;
  let configService: jest.Mocked<ReferralConfigService>;
  let referralQueue: jest.Mocked<ReferralQueueService>;

  beforeEach(async () => {
    referralRepo = {
      findByReferrerId: jest.fn(),
      findByCode: jest.fn(),
      findByRefereeId: jest.fn(),
      findRefereesByReferrer: jest.fn(),
      createReferral: jest.fn(),
      markQualified: jest.fn(),
    } as unknown as jest.Mocked<ReferralRepository>;

    creditLedger = {
      getBalance: jest.fn(),
    } as unknown as jest.Mocked<CreditLedgerService>;

    configService = {
      getConfig: jest.fn().mockResolvedValue({
        enabled: true,
        token_per_qualified_referee: 500,
        token_to_price_reduction_percent: 0.2,
        token_to_app_increase: 0.1,
        hold_period_days: 7,
      }),
    } as unknown as jest.Mocked<ReferralConfigService>;

    referralQueue = {
      scheduleReward: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReferralQueueService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: ReferralRepository, useValue: referralRepo },
        { provide: CreditLedgerService, useValue: creditLedger },
        { provide: ReferralConfigService, useValue: configService },
        { provide: ReferralQueueService, useValue: referralQueue },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  it('returns the referral code already assigned to the user', async () => {
    referralRepo.findByReferrerId.mockResolvedValue({ code: 'EXISTING1' });

    await expect(service.generateReferralCode('user-1')).resolves.toBe('EXISTING1');
  });

  it('attributes a signup to the owner of the submitted referral code', async () => {
    referralRepo.findByCode.mockResolvedValue({
      referrer_id: 'referrer-1',
      code: 'EXISTING1',
    });
    referralRepo.findByRefereeId.mockResolvedValue(null);

    await service.attributeReferral('referee-1', 'EXISTING1');

    expect(referralRepo.createReferral).toHaveBeenCalledWith(
      expect.objectContaining({
        referrer_id: 'referrer-1',
        referee_id: 'referee-1',
        code: 'EXISTING1',
        status: 'PENDING',
      }),
    );
  });

  it('schedules reward after the configured post-qualification hold period', async () => {
    const qualifiedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    referralRepo.findByRefereeId
      .mockResolvedValueOnce({
        id: 'referral-1',
        status: 'PENDING',
      })
      .mockResolvedValueOnce({
        id: 'referral-1',
        status: 'QUALIFIED',
        qualification_event: 'SUBSCRIPTION_ACTIVATED',
        qualified_at: qualifiedAt,
      });

    await service.qualifyReferral('referee-1');

    expect(referralRepo.markQualified).toHaveBeenCalledWith('referral-1');
    expect(referralQueue.scheduleReward).toHaveBeenCalledWith(
      'referral-1',
      new Date(qualifiedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
  });
});
