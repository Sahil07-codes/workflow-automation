import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralService } from './services/referral.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { ReferralConfigService } from './services/referral-config.service';
import { SubscriptionRenewalService } from './services/subscription-renewal.service';
import { TokenRedemptionService } from './services/token-redemption.service';
import { ReferralWebhookService } from './services/referral-webhook.service';
import { ReferralRepository } from './repositories/referral.repository';
import { CreditLedgerRepository } from './repositories/credit-ledger.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { ReferralConfigRepository } from './repositories/referral-config.repository';
import { SubscriptionRenewalRepository } from './repositories/subscription-renewal.repository';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ReferralsController],
  providers: [
    ReferralService,
    CreditLedgerService,
    ReferralConfigService,
    SubscriptionRenewalService,
    TokenRedemptionService,
    ReferralWebhookService,
    ReferralRepository,
    CreditLedgerRepository,
    WalletRepository,
    ReferralConfigRepository,
    SubscriptionRenewalRepository,
    PrismaService,
  ],
  exports: [
    ReferralService,
    CreditLedgerService,
    ReferralConfigService,
    SubscriptionRenewalService,
    TokenRedemptionService,
    ReferralWebhookService,
  ],
})
export class ReferralsModule {}
