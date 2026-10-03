import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_CONFIG } from '@autoapply/shared';
import { hmacSha256, randomNumericString, timingSafeEqual } from '@autoapply/crypto';
import { OtpChallengeRepository } from '../repositories/otp-challenge.repository';
import { RedisService } from '@/common/services/redis.service';
import { AppException } from '@/common/exceptions/app.exception';
import { OtpDelivery } from './otp-delivery';

@Injectable()
export class OtpService {
  private readonly pepper: string;

  constructor(
    private otpRepo: OtpChallengeRepository,
    private redisService: RedisService,
    private otpDelivery: OtpDelivery,
    configService: ConfigService,
  ) {
    this.pepper = configService.getOrThrow<string>('otp_pepper');
  }

  generateCode(): string {
    return randomNumericString(OTP_CONFIG.LENGTH);
  }

  hashCode(code: string): string {
    return hmacSha256(code, this.pepper);
  }

  async sendOtp(target: string, channel: 'EMAIL' | 'SMS', ip?: string): Promise<string> {
    const normalizedTarget = target.trim().toLowerCase();
    const lockKey = `otp:send:${channel}:${normalizedTarget}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 30);
    if (!lockToken) {
      throw new AppException('OTP_RATE_LIMITED', 'OTP request already in progress.', 429);
    }

    try {
      const now = Date.now();
      const recent = await this.otpRepo.findLatestByTarget(normalizedTarget);
      if (
        recent &&
        now - recent.created_at.getTime() < OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000
      ) {
        throw new AppException(
          'OTP_RESEND_COOLDOWN',
          `Please wait ${OTP_CONFIG.RESEND_COOLDOWN_SECONDS}s before requesting a new OTP.`,
          429,
        );
      }

      const count = await this.otpRepo.countSince(
        normalizedTarget,
        new Date(now - 60 * 60 * 1000),
      );
      if (count >= OTP_CONFIG.MAX_RESENDS_PER_HOUR) {
        throw new AppException(
          'OTP_RATE_LIMITED',
          'Too many OTP requests. Please try again later.',
          429,
        );
      }

      const code = this.generateCode();
      const challenge = await this.otpRepo.create({
        target: normalizedTarget,
        channel,
        code_hash: this.hashCode(code),
        expires_at: new Date(now + OTP_CONFIG.TTL_SECONDS * 1000),
        ip,
      });

      try {
        await this.otpDelivery.deliver(normalizedTarget, channel, code);
      } catch (error) {
        await this.otpRepo.consumeIfUnused(challenge.id);
        throw error;
      }

      return challenge.id;
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async verifyOtp(target: string, code: string): Promise<void> {
    // Find latest challenge
    const challenge = await this.otpRepo.findLatestByTarget(target);

    if (!challenge) {
      throw new AppException('OTP_CHALLENGE_NOT_FOUND', 'OTP challenge not found.', 404);
    }

    if (challenge.consumed_at) {
      throw new AppException('OTP_ALREADY_USED', 'OTP has already been used.', 400);
    }

    // Check expiry
    if (challenge.expires_at < new Date()) {
      throw new AppException('OTP_EXPIRED', 'OTP has expired.', 400);
    }

    // Check lockout
    if (challenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      throw new AppException(
        'OTP_MAX_ATTEMPTS_EXCEEDED',
        'Too many incorrect attempts. Please try again later.',
        429,
      );
    }

    // Verify code (constant-time comparison)
    const code_hash = this.hashCode(code);
    const isValid = timingSafeEqual(code_hash, challenge.code_hash);

    if (!isValid) {
      await this.otpRepo.increment(challenge.id);
      throw new AppException('OTP_INVALID', 'OTP is incorrect.', 400);
    }

    const consumed = await this.otpRepo.consumeIfUnused(challenge.id);
    if (!consumed) {
      throw new AppException('OTP_ALREADY_USED', 'OTP has already been used.', 400);
    }
  }
}
