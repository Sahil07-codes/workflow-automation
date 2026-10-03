import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReferralRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any): Promise<any> {
    return this.prisma.referrals.create({ data });
  }

  async createReferral(data: any): Promise<any> {
    return this.prisma.referrals.create({ data });
  }

  async findByCode(code: string): Promise<any> {
    const referrer = await this.prisma.user.findUnique({
      where: { referral_code: code },
      select: { id: true, referral_code: true },
    });
    return referrer
      ? { referrer_id: referrer.id, code: referrer.referral_code }
      : null;
  }

  async findByReferrerId(referrerId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: referrerId },
      select: { referral_code: true },
    });
    return user ? { code: user.referral_code } : null;
  }

  async findByRefereeId(refereeId: string): Promise<any> {
    return this.prisma.referrals.findUnique({ where: { referee_id: refereeId } });
  }

  async findRefereesByReferrer(referrerId: string): Promise<any[]> {
    return this.prisma.referrals.findMany({ where: { referrer_id: referrerId } });
  }

  async updateStatus(referralId: string, status: string): Promise<any> {
    return this.prisma.referrals.update({
      where: { id: referralId },
      data: { status, qualified_at: status === 'QUALIFIED' ? new Date() : undefined },
    });
  }

  async markQualified(referralId: string): Promise<void> {
    await this.prisma.referrals.updateMany({
      where: { id: referralId, status: 'PENDING' },
      data: {
        status: 'QUALIFIED',
        qualification_event: 'SUBSCRIPTION_ACTIVATED',
        qualified_at: new Date(),
      },
    });
  }
}
