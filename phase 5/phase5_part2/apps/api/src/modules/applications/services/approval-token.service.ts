import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as crypto from 'crypto';
import { UnauthorizedException, ConflictException } from '@nestjs/common';

@Injectable()
export class ApprovalTokenService {
  private logger = new Logger(ApprovalTokenService.name);

  constructor(private prisma: PrismaService) {}

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createApprovalToken(
    applicationId: string,
    payloadHash: string,
    ttlHours: number = 48,
  ) {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    await this.prisma.approvalToken.deleteMany({
      where: { applicationId },
    });

    const approval = await this.prisma.approvalToken.create({
      data: {
        applicationId,
        tokenHash,
        payloadHash,
        expiresAt,
        createdAt: new Date(),
      },
    });

    this.logger.log(`Approval token created for application: ${applicationId}`);
    return { approval, plaintext_token: token };
  }

  async verifyAndUseToken(
    plaintext_token: string,
    applicationId: string,
    userIp: string,
    userAgent: string,
  ) {
    const tokenHash = this.hashToken(plaintext_token);

    const approval = await this.prisma.approvalToken.findUnique({
      where: { applicationId },
    });

    if (!approval) {
      throw new UnauthorizedException('Invalid approval token');
    }

    if (approval.expiresAt < new Date()) {
      throw new UnauthorizedException('Approval link has expired');
    }

    if (approval.usedAt) {
      throw new ConflictException('This approval has already been used');
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(approval.tokenHash),
      Buffer.from(tokenHash),
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid approval token');
    }

    const updated = await this.prisma.approvalToken.update({
      where: { id: approval.id },
      data: {
        usedAt: new Date(),
        usedByIp: userIp,
        usedByUserAgent: userAgent,
      },
    });

    this.logger.log(
      `Approval token verified and used for application: ${applicationId}`,
    );
    return updated;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async findExpiredTokens() {
    return await this.prisma.approvalToken.findMany({
      where: {
        expiresAt: { lt: new Date() },
        usedAt: null,
      },
    });
  }

  async deleteExpiredTokens() {
    const result = await this.prisma.approvalToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`Deleted ${result.count} expired approval tokens`);
    return result;
  }
}
