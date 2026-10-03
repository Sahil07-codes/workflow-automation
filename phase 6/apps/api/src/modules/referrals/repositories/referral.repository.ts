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
    return this.prisma.referrals.findUnique({ where: { code } });
  }

  async findByReferrerId(referrerId: string): Promise<any> {
    return this.prisma.referrals.findFirst({ where: { referrer_id: referrerId } });
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
}
