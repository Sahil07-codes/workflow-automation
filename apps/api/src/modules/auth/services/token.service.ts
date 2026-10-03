import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { hashValue, randomHex } from '@autoapply/crypto';
import { JwtPayload, AuthTokens } from '@autoapply/shared';
import { AppException } from '@/common/exceptions/app.exception';
import { v4 as uuid } from 'uuid';

@Injectable()
export class TokenService {
  private readonly ACCESS_TOKEN_EXPIRY = 900; // 15 minutes in seconds
  private readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(
    private jwtService: JwtService,
    private refreshTokenRepo: RefreshTokenRepository,
  ) {}

  createAccessToken(
    userId: string,
    email: string,
    role: JwtPayload['role'],
    sessionId: string,
  ): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      role,
      sid: sessionId,
    };

    return this.jwtService.sign(payload);
  }

  async createRefreshToken(
    userId: string,
    ip?: string,
    userAgent?: string,
    familyId = uuid(),
  ): Promise<string> {
    const token = randomHex(32);
    const token_hash = hashValue(token);

    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY * 1000);

    await this.refreshTokenRepo.create({
      user_id: userId,
      family_id: familyId,
      token_hash,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

    return token;
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const token_hash = hashValue(refreshToken);

    const tokenRecord = await this.refreshTokenRepo.findByHash(token_hash);
    if (!tokenRecord) {
      throw new AppException('INVALID_TOKEN', 'Invalid refresh token.', 401);
    }

    // Reuse detection: if token was used, revoke family
    if (tokenRecord.used_at || tokenRecord.revoked_at) {
      await this.refreshTokenRepo.revokeFamily(tokenRecord.family_id);
      throw new AppException(
        'TOKEN_REVOKED',
        'Session revoked (possible theft detected).',
        401,
      );
    }

    // Check expiry
    if (tokenRecord.expires_at < new Date()) {
      throw new AppException('SESSION_EXPIRED', 'Refresh token expired.', 401);
    }

    // Only one concurrent request may consume a refresh token.
    const consumed = await this.refreshTokenRepo.markUsedIfUnused(tokenRecord.id);
    if (!consumed) {
      await this.refreshTokenRepo.revokeFamily(tokenRecord.family_id);
      throw new AppException(
        'TOKEN_REVOKED',
        'Session revoked (possible theft detected).',
        401,
      );
    }

    // Issue new tokens
    const { user } = tokenRecord;
    const newAccessToken = this.createAccessToken(
      user.id,
      user.email,
      user.role as JwtPayload['role'],
      tokenRecord.family_id,
    );
    const newRefreshToken = await this.createRefreshToken(
      user.id,
      tokenRecord.ip ?? undefined,
      tokenRecord.user_agent ?? undefined,
      tokenRecord.family_id,
    );

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: this.ACCESS_TOKEN_EXPIRY,
      token_type: 'Bearer',
    };
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.revokeByUserId(userId);
  }
}
