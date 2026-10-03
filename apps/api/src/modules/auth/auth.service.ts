import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { AppException } from '@/common/exceptions/app.exception';
import { SignupRequest, LoginRequest, JwtPayload } from '@autoapply/shared';
import { v4 as uuid } from 'uuid';
import { ReferralService } from '../referrals/services/referral.service';

@Injectable()
export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private otpService: OtpService,
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private referralService: ReferralService,
  ) {}

  async signup(req: SignupRequest, ip?: string) {
    if (req.referral_code) {
      await this.referralService.validateReferralCode(req.referral_code);
    }

    // Check if user exists
    const existing = await this.userRepo.findByEmail(req.email);
    if (existing) {
      throw new AppException('USER_EMAIL_TAKEN', 'Email already in use.', 409);
    }

    const phoneExisting = await this.userRepo.findByPhone(req.phone_e164);
    if (phoneExisting) {
      throw new AppException('USER_PHONE_TAKEN', 'Phone number already in use.', 409);
    }

    // Create user
    const user = await this.userRepo.create({
      email: req.email,
      phone_e164: req.phone_e164,
      password_hash: req.password ? await this.passwordService.hash(req.password) : undefined,
      referral_code: uuid(),
      consent_version: req.consent_version,
    });

    const referralCode = req.referral_code;
    if (referralCode) {
      await this.referralService.attributeReferral(user.id, referralCode);
    }

    // Send email OTP
    await this.otpService.sendOtp(req.email, 'EMAIL', ip);
    await this.otpService.sendOtp(req.phone_e164, 'SMS', ip);

    return {
      message: 'Signup successful. Please verify your email.',
      user_id: user.id,
      referral_code: user.referral_code,
    };
  }

  async sendOtp(req: { target: string; channel: 'EMAIL' | 'SMS' }, ip?: string) {
    const challengeId = await this.otpService.sendOtp(req.target, req.channel, ip);
    return { challenge_id: challengeId };
  }

  async verifyOtp(req: { target: string; code: string }) {
    await this.otpService.verifyOtp(req.target, req.code);

    // Find user
    const isEmail = req.target.includes('@');
    let user = await this.userRepo.findByEmailOrPhone(req.target, req.target);

    if (!user) {
      throw new AppException('USER_NOT_FOUND', 'User not found.', 404);
    }

    // Mark verified
    if (isEmail) {
      user = await this.userRepo.updateEmailVerified(user.id);
    } else {
      user = await this.userRepo.updatePhoneVerified(user.id);
    }

    // If both verified, activate user
    if (user.email_verified_at && user.phone_verified_at && user.status === 'PENDING') {
      user = await this.userRepo.updateStatus(user.id, 'ACTIVE');
    }

    return { message: 'Verified.', user_id: user.id };
  }

  async login(req: LoginRequest) {
    let user = await this.userRepo.findByEmailOrPhone(req.email || '', req.phone_e164 || '');

    if (!user) {
      throw new AppException('INVALID_CREDENTIALS', 'Email, phone, or password is incorrect.', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException(
        'USER_NOT_VERIFIED',
        'Please verify your email and phone before logging in.',
        403,
      );
    }

    // Verify based on method
    if (req.method === 'PASSWORD') {
      if (!req.password || !user.password_hash) {
        throw new AppException('INVALID_CREDENTIALS', 'Email, phone, or password is incorrect.', 401);
      }
      const isValid = await this.passwordService.verify(user.password_hash, req.password);
      if (!isValid) {
        throw new AppException('INVALID_CREDENTIALS', 'Email, phone, or password is incorrect.', 401);
      }
    } else if (req.method === 'OTP') {
      if (!req.otp_code) {
        throw new AppException('INVALID_INPUT', 'OTP code is required.', 400);
      }
      const target = req.email || req.phone_e164;
      await this.otpService.verifyOtp(target!, req.otp_code);
    }

    // Issue tokens
    const sessionId = uuid();
    const accessToken = this.tokenService.createAccessToken(
      user.id,
      user.email,
      user.role as JwtPayload['role'],
      sessionId,
    );
    const refreshToken = await this.tokenService.createRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      token_type: 'Bearer',
    };
  }

  async refresh(refreshToken: string) {
    return this.tokenService.refreshAccessToken(refreshToken);
  }

  async logout(userId: string) {
    await this.tokenService.revokeAllTokens(userId);
    return { message: 'Logged out.' };
  }
}
