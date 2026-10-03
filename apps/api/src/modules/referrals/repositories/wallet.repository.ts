import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class WalletRepository {
  constructor(private prisma: PrismaService) {}

  async ensureWalletExists(userId: string): Promise<any> {
    return this.prisma.wallets.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId, total_earned: 0, total_spent: 0 },
    });
  }

  async getWallet(userId: string): Promise<any> {
    return this.prisma.wallets.findUnique({ where: { user_id: userId } });
  }

  async updateBalance(userId: string): Promise<any> {
    const balance = await this.prisma.$queryRaw<
      Array<{ total_earned: bigint; total_spent: bigint }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) as total_spent
      FROM credit_ledger
      WHERE user_id = ${userId}
    `;

    const { total_earned, total_spent } = balance[0];

    return this.prisma.wallets.update({
      where: { user_id: userId },
      data: {
        total_earned: Number(total_earned),
        total_spent: Number(total_spent),
      },
    });
  }
}
