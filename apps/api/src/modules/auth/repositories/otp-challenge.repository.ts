import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class OtpChallengeRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    target: string;
    channel: 'EMAIL' | 'SMS';
    code_hash: string;
    expires_at: Date;
    ip?: string;
  }) {
    return this.prisma.otpChallenge.create({ data });
  }

  async findLatestByTarget(target: string) {
    return this.prisma.otpChallenge.findFirst({
      where: { target },
      orderBy: { created_at: 'desc' },
    });
  }

  async countSince(target: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({
      where: { target, created_at: { gte: since } },
    });
  }

  async findById(id: string) {
    return this.prisma.otpChallenge.findUnique({ where: { id } });
  }

  async increment(id: string) {
    return this.prisma.otpChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async consumeIfUnused(id: string): Promise<boolean> {
    const result = await this.prisma.otpChallenge.updateMany({
      where: { id, consumed_at: null, expires_at: { gt: new Date() } },
      data: { consumed_at: new Date() },
    });
    return result.count === 1;
  }
}
