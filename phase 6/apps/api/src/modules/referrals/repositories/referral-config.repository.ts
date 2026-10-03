import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReferralConfigRepository {
  constructor(private prisma: PrismaService) {}

  async getConfig(): Promise<any> {
    let config = await this.prisma.referral_config.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await this.prisma.referral_config.create({
        data: {
          id: 1,
          token_per_qualified_referee: 500,
          token_to_price_reduction_percent: 0.2,
          token_to_app_increase: 0.1,
          max_tokens_per_renewal: 5000,
          hold_period_days: 7,
          enabled: true,
        },
      });
    }
    return config;
  }

  async updateConfig(updates: any, adminId: string): Promise<any> {
    const config = await this.prisma.referral_config.update({
      where: { id: 1 },
      data: { ...updates, updated_at: new Date() },
    });

    // Audit log (assuming admin_audit_log table exists)
    try {
      await this.prisma.admin_audit_log.create({
        data: {
          admin_id: adminId,
          action: 'referral_config_updated',
          meta: updates,
        },
      });
    } catch (e) {
      // Table might not exist in early stage
    }

    return config;
  }
}
