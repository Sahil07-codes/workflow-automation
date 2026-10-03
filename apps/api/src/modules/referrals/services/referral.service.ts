import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ReferralRepository } from '../repositories/referral.repository';
import { CreditLedgerService } from './credit-ledger.service';
import { ReferralConfigService } from './referral-config.service';
import { ReferralQueueService } from './referral-queue.service';

@Injectable()
export class ReferralService {
  private logger = new Logger(ReferralService.name);

  constructor(
    private referralRepo: ReferralRepository,
    private creditLedger: CreditLedgerService,
    private configService: ReferralConfigService,
    private referralQueue: ReferralQueueService,
  ) {}

  async generateReferralCode(userId: string): Promise<string> {
    const existing = await this.referralRepo.findByReferrerId(userId);
    if (!existing) throw new BadRequestException('User not found');
    return existing.code;
  }

  async validateReferralCode(code: string): Promise<void> {
    const config = await this.configService.getConfig();
    if (!config.enabled) return;
    if (!(await this.referralRepo.findByCode(code))) {
      throw new BadRequestException('Invalid referral code');
    }
  }

  async attributeReferral(refereeId: string, referralCode: string): Promise<void> {
    const config = await this.configService.getConfig();
    if (!config.enabled) return;

    const referral = await this.referralRepo.findByCode(referralCode);
    if (!referral) throw new BadRequestException('Invalid referral code');
    if (referral.referrer_id === refereeId) {
      throw new BadRequestException('You cannot use your own referral code');
    }

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

    let referral = await this.referralRepo.findByRefereeId(refereeId);
    if (!referral) return;
    if (referral.status === 'PENDING') {
      await this.referralRepo.markQualified(referral.id);
      referral = await this.referralRepo.findByRefereeId(refereeId);
    }
    if (
      referral?.status !== 'QUALIFIED' ||
      referral.qualification_event !== 'SUBSCRIPTION_ACTIVATED' ||
      !referral.qualified_at
    ) {
      return;
    }

    const dueAt = new Date(
      referral.qualified_at.getTime() + config.hold_period_days * 24 * 60 * 60 * 1000,
    );
    await this.referralQueue.scheduleReward(referral.id, dueAt);
    this.logger.log(`Referral reward scheduled for ${referral.id} at ${dueAt.toISOString()}`);
  }

  async getReferralStats(userId: string): Promise<any> {
    const code = await this.referralRepo.findByReferrerId(userId);
    const referrals = await this.referralRepo.findRefereesByReferrer(userId);
    const balance = await this.creditLedger.getBalance(userId);

    const qualified = referrals.filter((r) => ['QUALIFIED', 'REWARDED'].includes(r.status));
    const pending = referrals.filter((r) => r.status === 'PENDING');

    return {
      referral_code: code?.code || null,
      total_referrals: referrals.length,
      qualified_referrals: qualified.length,
      pending_referrals: pending.length,
      tokens_earned: balance.earned,
      tokens_available: balance.balance,
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

}
