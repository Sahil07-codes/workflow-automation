import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ApprovalTokenRepository } from '../repositories/approval-token.repository';

@Injectable()
export class ApprovalTokenService {
  constructor(private readonly repository: ApprovalTokenRepository) {}

  async createApprovalToken(applicationId: string, payloadHash: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.repository.replace(
      applicationId,
      this.hashToken(token),
      payloadHash,
      expiresAt,
    );
    return { token, expiresAt };
  }

  async verifyAndUseToken(
    plaintextToken: string,
    applicationId: string,
    userIp: string,
    userAgent: string,
  ) {
    const stored = await this.repository.findByApplicationId(applicationId);
    if (!stored) {
      throw new UnauthorizedException('Invalid approval token');
    }

    const candidateHash = this.hashToken(plaintextToken);
    const expected = Buffer.from(stored.tokenHash, 'hex');
    const candidate = Buffer.from(candidateHash, 'hex');
    if (
      expected.length !== candidate.length ||
      !timingSafeEqual(expected, candidate)
    ) {
      throw new UnauthorizedException('Invalid approval token');
    }

    const now = new Date();
    if (stored.expiresAt <= now) {
      throw new UnauthorizedException('Approval link has expired');
    }
    if (stored.usedAt) {
      throw new ConflictException('This approval link has already been used');
    }

    const consumed = await this.repository.consume(
      applicationId,
      candidateHash,
      now,
      userIp,
      userAgent,
    );
    if (!consumed) {
      throw new ConflictException('This approval link is no longer available');
    }
    return stored;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
