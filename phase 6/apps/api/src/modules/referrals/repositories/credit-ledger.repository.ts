import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CreditLedgerRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, delta: number, reason: string, refId: string): Promise<any> {
    return this.prisma.credit_ledger.create({
      data: { user_id: userId, delta, reason, ref_id: refId },
    });
  }

  async getBalance(userId: string): Promise<any> {
    const result = await this.prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) as earned,
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) as spent
      FROM credit_ledger
      WHERE user_id = ${userId}
    `;

    const { earned, spent } = result[0];
    return {
      earned: Number(earned),
      spent: Number(spent),
      balance: Number(earned) - Number(spent),
    };
  }

  async getHistory(userId: string, limit: number, offset: number): Promise<any[]> {
    return this.prisma.credit_ledger.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getByRefId(reason: string, refId: string): Promise<any> {
    return this.prisma.credit_ledger.findFirst({
      where: { reason, ref_id: refId },
    });
  }
}
