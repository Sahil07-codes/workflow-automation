import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from './services/referral.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { ReferralConfigService } from './services/referral-config.service';
import { ReferralRepository } from './repositories/referral.repository';
import { WalletRepository } from './repositories/wallet.repository';

describe('ReferralService', () => {
  let service: ReferralService;
  let referralRepo: jest.Mocked<ReferralRepository>;
  let creditLedger: jest.Mocked<CreditLedgerService>;
  let configService: jest.Mocked<ReferralConfigService>;
  let walletRepo: jest.Mocked<WalletRepository>;

  beforeEach(async () => {
    referralRepo = {
      findByReferrerId: jest.fn(),
      findByCode: jest.fn(),
      findByRefereeId: jest.fn(),
      findRefereesByReferrer: jest.fn(),
      create: jest.fn(),
      createReferral: jest.fn(),
      updateStatus: jest.fn(),
    } as any;

    creditLedger = {
      award: jest.fn(),
      spend: jest.fn(),
      getBalance: jest.fn(),
      getHistory: jest.fn(),
    } as any;

    configService = {
      getConfig: jest.fn().mockResolvedValue({
        enabled: true,
        token_per_qualified_referee: 500,
        token_to_price_reduction_percent: 0.2,
        token_to_app_increase: 0.1,
      }),
      updateConfig: jest.fn(),
    } as any;

    walletRepo = {
      ensureWalletExists: jest.fn(),
      getWallet: jest.fn(),
      updateBalance: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: ReferralRepository, useValue: referralRepo },
        { provide: CreditLedgerService, useValue: creditLedger },
        { provide: ReferralConfigService, useValue: configService },
        { provide: WalletRepository, useValue: walletRepo },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReferralCode', () => {
    it('should generate a unique 8-char code', async () => {
      referralRepo.findByReferrerId.mockResolvedValue(null);
      referralRepo.create.mockResolvedValue({ code: 'ABC12345' });

      const code = await service.generateReferralCode('user-1');
      expect(code).toHaveLength(8);
      expect(referralRepo.create).toHaveBeenCalled();
    });

    it('should return existing code if user already has one', async () => {
      referralRepo.findByReferrerId.mockResolvedValue({ code: 'EXISTING' });

      const code = await service.generateReferralCode('user-1');
      expect(code).toBe('EXISTING');
    });
  });

  describe('qualifyReferral', () => {
    it('should award tokens to referrer when referee qualifies', async () => {
      const referral = { id: 'ref-1', referrer_id: 'user-a', referee_id: 'user-b', status: 'PENDING' };
      referralRepo.findByRefereeId.mockResolvedValue(referral);
      referralRepo.updateStatus.mockResolvedValue({ ...referral, status: 'QUALIFIED' });

      await service.qualifyReferral('user-b');

      expect(referralRepo.updateStatus).toHaveBeenCalledWith('ref-1', 'QUALIFIED');
      expect(creditLedger.award).toHaveBeenCalledWith('user-a', 500, 'REFERRAL_EARNED', 'ref-1');
      expect(walletRepo.ensureWalletExists).toHaveBeenCalledWith('user-a');
    });
  });
});
