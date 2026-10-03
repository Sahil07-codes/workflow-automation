import { Controller, Get, Post, Put, Body, UseGuards, Param, Query } from '@nestjs/common';
import { ReferralService } from './services/referral.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { ReferralConfigService } from './services/referral-config.service';
import { SubscriptionRenewalService } from './services/subscription-renewal.service';
import { TokenRedemptionService } from './services/token-redemption.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RedeemTokensDto } from './dto/redeem-tokens.dto';
import { ReferralConfigDto } from './dto/referral-config.dto';

@Controller('v1')
export class ReferralsController {
  constructor(
    private referralService: ReferralService,
    private creditLedgerService: CreditLedgerService,
    private configService: ReferralConfigService,
    private renewalService: SubscriptionRenewalService,
    private tokenRedemptionService: TokenRedemptionService,
  ) {}

  // ============ REFERRAL MANAGEMENT (3) ============

  @Get('referrals/me')
  @UseGuards(JwtAuthGuard)
  async getReferralStats(@CurrentUser() user: any) {
    return this.referralService.getReferralStats(user.id);
  }

  @Post('referrals/generate')
  @UseGuards(JwtAuthGuard)
  async generateReferralCode(@CurrentUser() user: any) {
    const code = await this.referralService.generateReferralCode(user.id);
    return { code };
  }

  @Get('referrals/status')
  @UseGuards(JwtAuthGuard)
  async getReferralStatus(@CurrentUser() user: any) {
    return this.referralService.getReferralStatus(user.id);
  }

  // ============ WALLET / CREDITS (3) ============

  @Get('wallet/balance')
  @UseGuards(JwtAuthGuard)
  async getWalletBalance(@CurrentUser() user: any) {
    return this.creditLedgerService.getBalance(user.id);
  }

  @Get('wallet/transactions')
  @UseGuards(JwtAuthGuard)
  async getWalletTransactions(
    @CurrentUser() user: any,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.creditLedgerService.getHistory(user.id, limit, offset);
  }

  @Get('wallet/summary')
  @UseGuards(JwtAuthGuard)
  async getWalletSummary(@CurrentUser() user: any) {
    const balance = await this.creditLedgerService.getBalance(user.id);
    return {
      total_earned: balance.earned,
      total_spent: balance.spent,
      balance: balance.balance,
    };
  }

  // ============ SUBSCRIPTION RENEWAL (3) ============

  @Get('subscriptions/:id/renewal-options')
  @UseGuards(JwtAuthGuard)
  async getRenewalOptions(@Param('id') subscriptionId: string, @CurrentUser() user: any) {
    return this.renewalService.getRenewalOptions(subscriptionId, user.id);
  }

  @Post('subscriptions/:id/redeem-tokens')
  @UseGuards(JwtAuthGuard)
  async redeemTokens(
    @Param('id') subscriptionId: string,
    @CurrentUser() user: any,
    @Body() dto: RedeemTokensDto,
  ) {
    return this.tokenRedemptionService.applyRedemption(subscriptionId, user.id, dto.option, dto.tokens_to_redeem);
  }

  @Get('subscriptions/upcoming-renewals')
  @UseGuards(JwtAuthGuard)
  async getUpcomingRenewals(@CurrentUser() user: any) {
    return this.renewalService.getUpcomingRenewals(user.id);
  }

  // ============ ADMIN CONFIG (2) ============

  @Get('admin/referral-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getConfig() {
    return this.configService.getConfig();
  }

  @Put('admin/referral-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  async updateConfig(@Body() dto: ReferralConfigDto, @CurrentUser() user: any) {
    return this.configService.updateConfig(dto, user.id);
  }
}
