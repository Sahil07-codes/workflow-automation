import { BadRequestException, Controller, Get, Post, Put, Body, UseGuards, Param, Query } from '@nestjs/common';
import { UserRole } from '@autoapply/shared';
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

@Controller()
export class ReferralsController {
  constructor(
    private referralService: ReferralService,
    private creditLedgerService: CreditLedgerService,
    private configService: ReferralConfigService,
    private renewalService: SubscriptionRenewalService,
    private tokenRedemptionService: TokenRedemptionService,
  ) {}

  // ============ REFERRAL MANAGEMENT (3) ============

  @Get('referrals')
  @UseGuards(JwtAuthGuard)
  async getReferralOverview(@CurrentUser() user: { id: string }) {
    return this.referralService.getReferralStats(user.id);
  }

  @Get('referrals/me')
  @UseGuards(JwtAuthGuard)
  async getReferralStats(@CurrentUser() user: { id: string }) {
    return this.referralService.getReferralStats(user.id);
  }

  @Post('referrals/generate')
  @UseGuards(JwtAuthGuard)
  async generateReferralCode(@CurrentUser() user: { id: string }) {
    const code = await this.referralService.generateReferralCode(user.id);
    return { code };
  }

  @Get('referrals/status')
  @UseGuards(JwtAuthGuard)
  async getReferralStatus(@CurrentUser() user: { id: string }) {
    return this.referralService.getReferralStatus(user.id);
  }

  // ============ WALLET / CREDITS (3) ============

  @Get('wallet/balance')
  @UseGuards(JwtAuthGuard)
  async getWalletBalance(@CurrentUser() user: { id: string }) {
    return this.creditLedgerService.getBalance(user.id);
  }

  @Get('wallet/transactions')
  @UseGuards(JwtAuthGuard)
  async getWalletTransactions(
    @CurrentUser() user: { id: string },
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100 ||
      !Number.isInteger(parsedOffset) ||
      parsedOffset < 0
    ) {
      throw new BadRequestException('Invalid pagination values');
    }
    return this.creditLedgerService.getHistory(user.id, parsedLimit, parsedOffset);
  }

  @Get('wallet/summary')
  @UseGuards(JwtAuthGuard)
  async getWalletSummary(@CurrentUser() user: { id: string }) {
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
  async getRenewalOptions(@Param('id') subscriptionId: string, @CurrentUser() user: { id: string }) {
    return this.renewalService.getRenewalOptions(subscriptionId, user.id);
  }

  @Post('subscriptions/:id/redeem-tokens')
  @UseGuards(JwtAuthGuard)
  async redeemTokens(
    @Param('id') subscriptionId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RedeemTokensDto,
  ) {
    return this.tokenRedemptionService.applyRedemption(
      subscriptionId,
      user.id,
      dto.option,
      dto.tokens_to_redeem,
    );
  }

  @Get('subscriptions/upcoming-renewals')
  @UseGuards(JwtAuthGuard)
  async getUpcomingRenewals(@CurrentUser() user: { id: string }) {
    return this.renewalService.getUpcomingRenewals(user.id);
  }

  // ============ ADMIN CONFIG (2) ============

  @Get('admin/referral-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getConfig() {
    return this.configService.getConfig();
  }

  @Put('admin/referral-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async updateConfig(@Body() dto: ReferralConfigDto, @CurrentUser() user: { id: string }) {
    return this.configService.updateConfig(dto, user.id);
  }
}
