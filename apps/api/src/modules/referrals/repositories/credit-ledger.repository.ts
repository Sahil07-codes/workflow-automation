import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CreditLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async award(userId: string, delta: number, reason: string, refId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId },
        update: {},
      });
      const inserted = await transaction.credit_ledger.createMany({
        data: [{ user_id: userId, delta, reason, ref_id: refId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return false;
      await this.refreshWallet(transaction, userId);
      return true;
    });
  }

  async spend(
    userId: string,
    amount: number,
    reason: string,
    refId: string,
  ): Promise<{ spent: boolean; balance: number }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId },
        update: {},
      });
      await transaction.$queryRaw`
        SELECT user_id
        FROM wallets
        WHERE user_id = CAST(${userId} AS UUID)
        FOR UPDATE
      `;

      const existing = await transaction.credit_ledger.findFirst({
        where: { user_id: userId, reason, ref_id: refId },
      });
      const balanceRows = await transaction.$queryRaw<Array<{ balance: bigint }>>`
        SELECT COALESCE(SUM(delta), 0)::bigint AS balance
        FROM credit_ledger
        WHERE user_id = CAST(${userId} AS UUID)
      `;
      const balance = Number(balanceRows[0]?.balance ?? 0n);
      if (existing) return { spent: true, balance };
      if (balance < amount) return { spent: false, balance };

      await transaction.credit_ledger.create({
        data: { user_id: userId, delta: -amount, reason, ref_id: refId },
      });
      await this.refreshWallet(transaction, userId);
      return { spent: true, balance: balance - amount };
    });
  }

  async getBalance(userId: string): Promise<{ earned: number; spent: number; balance: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ earned: bigint; spent: bigint }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::bigint AS earned,
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::bigint AS spent
      FROM credit_ledger
      WHERE user_id = CAST(${userId} AS UUID)
    `;

    const earned = Number(result[0]?.earned ?? 0n);
    const spent = Number(result[0]?.spent ?? 0n);
    return { earned, spent, balance: earned - spent };
  }

  async getHistory(userId: string, limit: number, offset: number) {
    const rows = await this.prisma.credit_ledger.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }

  private async refreshWallet(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const sums = await transaction.$queryRaw<
      Array<{ total_earned: bigint; total_spent: bigint }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::bigint AS total_earned,
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::bigint AS total_spent
      FROM credit_ledger
      WHERE user_id = CAST(${userId} AS UUID)
    `;
    await transaction.wallets.update({
      where: { user_id: userId },
      data: {
        total_earned: Number(sums[0]?.total_earned ?? 0n),
        total_spent: Number(sums[0]?.total_spent ?? 0n),
        updated_at: new Date(),
      },
    });
  }
}
