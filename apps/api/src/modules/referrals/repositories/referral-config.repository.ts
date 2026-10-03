import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReferralConfigRepository {
  constructor(private prisma: PrismaService) {}

  async getConfig(): Promise<any> {
    const config = await this.prisma.referral_config.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return {
      ...config,
      token_to_price_reduction_percent: Number(config.token_to_price_reduction_percent),
      token_to_app_increase: Number(config.token_to_app_increase),
    };
  }

  async updateConfig(updates: any, adminId: string): Promise<any> {
    const config = await this.prisma.referral_config.update({
      where: { id: 1 },
      data: { ...updates, updated_at: new Date() },
    });
    return {
      ...config,
      token_to_price_reduction_percent: Number(config.token_to_price_reduction_percent),
      token_to_app_increase: Number(config.token_to_app_increase),
      updated_by: adminId,
    };
  }
}
