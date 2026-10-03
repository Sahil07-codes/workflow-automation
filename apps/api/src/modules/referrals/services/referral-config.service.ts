import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ReferralConfigRepository } from '../repositories/referral-config.repository';

@Injectable()
export class ReferralConfigService {
  private logger = new Logger(ReferralConfigService.name);
  private cachedConfig: any = null;
  private cacheTime = 0;
  private cacheTTL = 60000; // 1 minute

  constructor(private configRepo: ReferralConfigRepository) {}

  async getConfig(): Promise<any> {
    const now = Date.now();
    if (this.cachedConfig && now - this.cacheTime < this.cacheTTL) {
      return this.cachedConfig;
    }

    const config = await this.configRepo.getConfig();
    this.cachedConfig = config;
    this.cacheTime = now;
    return config;
  }

  async updateConfig(updates: any, adminId: string): Promise<any> {
    this.validateConfig(updates);
    const config = await this.configRepo.updateConfig(updates, adminId);
    this.cachedConfig = config;
    this.cacheTime = Date.now();
    this.logger.log(`Config updated by ${adminId}:`, updates);
    return config;
  }

  private validateConfig(config: any): void {
    if (config.token_per_qualified_referee !== undefined) {
      if (config.token_per_qualified_referee < 1) {
        throw new BadRequestException('token_per_qualified_referee must be >= 1');
      }
    }
    if (config.token_to_price_reduction_percent !== undefined) {
      if (config.token_to_price_reduction_percent < 0 || config.token_to_price_reduction_percent > 100) {
        throw new BadRequestException('token_to_price_reduction_percent must be 0-100');
      }
    }
    if (config.hold_period_days !== undefined) {
      if (config.hold_period_days < 0) {
        throw new BadRequestException('hold_period_days must be >= 0');
      }
    }
  }
}
