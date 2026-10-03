import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ReferralRepository } from '../repositories/referral.repository';
import { CreditLedgerService } from './credit-ledger.service';
import { ReferralConfigService } from './referral-config.service';
import { WalletRepository } from '../repositories/wallet.repository';

@Injectable()
export class ReferralService {
  private logger = new Logger(ReferralService.name);

  constructor(
    private referralRepo: ReferralRepository,
    private creditLedger: CreditLedgerService,
    private configService: ReferralConfigService,
    private walletRepo: WalletRepository,
  ) {}

  async generateReferralCode(userId: string): Promise<string> {
    const code = this.generateUniqueCode();
    const existing = await this.referralRepo.findByReferrerId(userId);
    if (existing) return existing.code;
    await this.referralRepo.create({ referrer_id: userId, code });
    return code;
  }

  async attributeReferral(refereeId: string, referralCode: string): Promise<void> {
    const config = await this.configService.getConfig();
    if (!config.enabled) return;

    const referral = await this.referralRepo.findByCode(referralCode);
    if (!referral) throw new BadRequestException('Invalid referral code');

    const existing = await this.referralRepo.findByRefereeId(refereeId);
    if (existing) throw new ConflictException('Already referred');

    await this.referralRepo.createReferral({
      referrer_id: referral.referrer_id,
      referee_id: refereeId,
      code: referralCode,
      referred_at: new Date(),
      status: 'PENDING',
    });
  }

  async qualifyReferral(refereeId: string): Promise<void> {
    const config = await this.configService.getConfig();
    if (!config.enabled) return;

    const referral = await this.referralRepo.findByRefereeId(refereeId);
    if (!referral || referral.status !== 'PENDING') return;

    await this.referralRepo.updateStatus(referral.id, 'QUALIFIED');
    const tokens = config.token_per_qualified_referee;
    await this.creditLedger.award(referral.referrer_id, tokens, 'REFERRAL_EARNED', referral.id);
    await this.walletRepo.ensureWalletExists(referral.referrer_id);

    this.logger.log(`Referral qualified: ${referral.referrer_id} earned ${tokens} tokens`);
  }

  async getReferralStats(userId: string): Promise<any> {
    const code = await this.referralRepo.findByReferrerId(userId);
    const referrals = await this.referralRepo.findRefereesByReferrer(userId);
    const wallet = await this.walletRepo.getWallet(userId);

    const qualified = referrals.filter((r) => ['QUALIFIED', 'REWARDED'].includes(r.status));
    const pending = referrals.filter((r) => r.status === 'PENDING');

    return {
      referral_code: code?.code || null,
      total_referrals: referrals.length,
      qualified_referrals: qualified.length,
      pending_referrals: pending.length,
      tokens_earned: wallet?.total_earned || 0,
      tokens_available: wallet?.balance || 0,
    };
  }

  async getReferralStatus(refereeId: string): Promise<any> {
    const referral = await this.referralRepo.findByRefereeId(refereeId);
    if (!referral) return { has_referral: false, referrer_id: null, status: null };
    return {
      has_referral: true,
      referrer_id: referral.referrer_id,
      status: referral.status,
      referred_at: referral.referred_at,
      qualified_at: referral.qualified_at,
    };
  }

  private generateUniqueCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
