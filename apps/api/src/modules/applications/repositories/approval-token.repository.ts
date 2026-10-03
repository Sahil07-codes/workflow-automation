import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ApprovalTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByApplicationId(applicationId: string) {
    return this.prisma.approvalToken.findUnique({
      where: { applicationId },
    });
  }

  replace(
    applicationId: string,
    tokenHash: string,
    payloadHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.approvalToken.upsert({
      where: { applicationId },
      create: { applicationId, tokenHash, payloadHash, expiresAt },
      update: {
        tokenHash,
        payloadHash,
        expiresAt,
        usedAt: null,
        usedByIp: null,
        usedByUserAgent: null,
      },
    });
  }

  async consume(
    applicationId: string,
    tokenHash: string,
    now: Date,
    ip: string,
    userAgent: string,
  ): Promise<boolean> {
    const result = await this.prisma.approvalToken.updateMany({
      where: {
        applicationId,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now, usedByIp: ip, usedByUserAgent: userAgent },
    });
    return result.count === 1;
  }
}
