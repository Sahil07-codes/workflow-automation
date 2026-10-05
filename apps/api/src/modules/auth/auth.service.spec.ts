import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { UserRepository } from './repositories/user.repository';
import { AppException } from '@/common/exceptions/app.exception';
import { ReferralService } from '../referrals/services/referral.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockOtpService: jest.Mocked<OtpService>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockPasswordService: jest.Mocked<PasswordService>;
  let mockReferralService: jest.Mocked<ReferralService>;

  beforeEach(async () => {
    mockUserRepo = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByEmailOrPhone: jest.fn(),
      updateEmailVerified: jest.fn(),
      updatePhoneVerified: jest.fn(),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      updatePassword: jest.fn(),
    } as any;

    mockOtpService = {
      generateCode: jest.fn().mockReturnValue('123456'),
      hashCode: jest.fn(),
      sendOtp: jest.fn(),
      verifyOtp: jest.fn(),
    } as any;

    mockTokenService = {
      createAccessToken: jest.fn().mockReturnValue('access-token'),
      createRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
      refreshAccessToken: jest.fn(),
      revokeAllTokens: jest.fn(),
    } as any;

    mockPasswordService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn(),
    } as any;

    mockReferralService = {
      validateReferralCode: jest.fn(),
      attributeReferral: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: OtpService, useValue: mockOtpService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: ReferralService, useValue: mockReferralService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('should create a new user', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        phone_e164: '+91 9999999999',
      };

      mockUserRepo.findByEmail.mockResolvedValueOnce(null);
      mockUserRepo.findByPhone.mockResolvedValueOnce(null);
      mockUserRepo.create.mockResolvedValueOnce(user as any);
      mockOtpService.sendOtp.mockResolvedValue('challenge-id');

      const result = await service.signup({
        email: 'test@example.com',
        phone_e164: '+91 9999999999',
        consent_version: '1.0',
      }, '127.0.0.1');

      expect(result.user_id).toBe('user-123');
      expect(mockOtpService.sendOtp).toHaveBeenNthCalledWith(
        1,
        'test@example.com',
        'EMAIL',
        '127.0.0.1',
      );
      expect(mockOtpService.sendOtp).toHaveBeenNthCalledWith(
        2,
        '+91 9999999999',
        'SMS',
        '127.0.0.1',
      );
    });

    it('should throw if email already exists', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce({ id: 'existing' } as any);

      await expect(
        service.signup({
          email: 'test@example.com',
          phone_e164: '+91 9999999999',
          consent_version: '1.0',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('login', () => {
    it('should login with OTP', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        status: 'ACTIVE',
      };

      mockUserRepo.findByEmailOrPhone.mockResolvedValueOnce(user as any);
      mockOtpService.verifyOtp.mockResolvedValueOnce(undefined);
      mockTokenService.createAccessToken.mockReturnValueOnce('access-token');
      mockTokenService.createRefreshToken.mockResolvedValueOnce('refresh-token');

      const result = await service.login({
        email: 'test@example.com',
        method: 'OTP',
        otp_code: '123456',
      });

      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      const [, , , sessionId] = mockTokenService.createAccessToken.mock.calls[0];
      expect(mockTokenService.createRefreshToken).toHaveBeenCalledWith(
        'user-123',
        undefined,
        undefined,
        sessionId,
      );
    });

    it('should throw if user not found', async () => {
      mockUserRepo.findByEmailOrPhone.mockResolvedValueOnce(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          method: 'OTP',
          otp_code: '123456',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('refresh', () => {
    it('should refresh tokens', async () => {
      const tokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 900,
        token_type: 'Bearer',
      };

      mockTokenService.refreshAccessToken.mockResolvedValueOnce(tokens);

      const result = await service.refresh('old-refresh-token');
      expect(result.access_token).toBe('new-access-token');
    });
  });

  describe('password reset', () => {
    it('requests an email code without revealing whether the address has an account', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce({
        status: 'ACTIVE',
      } as any);
      mockOtpService.sendOtp.mockResolvedValueOnce('challenge-id');

      const result = await service.requestPasswordReset(
        'test@example.com',
        '127.0.0.1',
      );

      expect(mockOtpService.sendOtp).toHaveBeenCalledWith(
        'test@example.com',
        'EMAIL',
        '127.0.0.1',
      );
      expect(result.message).toContain('If this email is associated');
    });

    it('returns the same request response without sending a code for an unknown account', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce(null);

      const result = await service.requestPasswordReset('unknown@example.com');

      expect(mockOtpService.sendOtp).not.toHaveBeenCalled();
      expect(result.message).toContain('If this email is associated');
    });

    it('updates the password and revokes existing sessions after OTP verification', async () => {
      mockOtpService.verifyOtp.mockResolvedValueOnce(undefined);
      mockUserRepo.findByEmail.mockResolvedValueOnce({
        id: 'user-123',
        status: 'ACTIVE',
      } as any);
      mockPasswordService.hash.mockResolvedValueOnce('new-password-hash');
      mockUserRepo.updatePassword.mockResolvedValueOnce({} as any);
      mockTokenService.revokeAllTokens.mockResolvedValueOnce(undefined);

      const result = await service.confirmPasswordReset(
        'test@example.com',
        '123456',
        'new-password',
      );

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith(
        'test@example.com',
        '123456',
      );
      expect(mockUserRepo.updatePassword).toHaveBeenCalledWith(
        'user-123',
        'new-password-hash',
      );
      expect(mockTokenService.revokeAllTokens).toHaveBeenCalledWith('user-123');
      expect(result.message).toContain('Password reset successfully');
    });

    it('does not change the password when the email code is invalid', async () => {
      mockOtpService.verifyOtp.mockRejectedValueOnce(new Error('Invalid OTP'));

      await expect(
        service.confirmPasswordReset(
          'test@example.com',
          '000000',
          'new-password',
        ),
      ).rejects.toThrow('Invalid OTP');
      expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
    });
  });
});
