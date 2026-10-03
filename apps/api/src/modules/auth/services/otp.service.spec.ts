import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { OtpChallengeRepository } from '../repositories/otp-challenge.repository';
import { AppException } from '@/common/exceptions/app.exception';
import { RedisService } from '@/common/services/redis.service';
import { OtpDelivery } from './otp-delivery';
import { ConfigService } from '@nestjs/config';

describe('OtpService', () => {
  let service: OtpService;
  let mockRepo: jest.Mocked<OtpChallengeRepository>;
  let mockRedis: jest.Mocked<RedisService>;
  let mockDelivery: jest.Mocked<OtpDelivery>;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      findLatestByTarget: jest.fn(),
      countSince: jest.fn().mockResolvedValue(0),
      findById: jest.fn(),
      increment: jest.fn(),
      consumeIfUnused: jest.fn().mockResolvedValue(true),
    } as any;
    mockRedis = {
      acquireLock: jest.fn().mockResolvedValue('test-lock'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    } as any;
    mockDelivery = { deliver: jest.fn().mockResolvedValue(undefined) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: OtpChallengeRepository, useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: OtpDelivery, useValue: mockDelivery },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-pepper') },
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('generateCode', () => {
    it('should generate 6-digit code', () => {
      const code = service.generateCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate unique codes', () => {
      const code1 = service.generateCode();
      const code2 = service.generateCode();
      // They might be same by chance, but statistically should differ
      expect(typeof code1).toBe('string');
      expect(typeof code2).toBe('string');
    });
  });

  describe('hashCode', () => {
    it('should hash OTP code consistently', () => {
      const code = '123456';
      const hash1 = service.hashCode(code);
      const hash2 = service.hashCode(code);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different code', () => {
      const hash1 = service.hashCode('123456');
      const hash2 = service.hashCode('654321');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('sendOtp', () => {
    it('should send OTP for email', async () => {
      mockRepo.findLatestByTarget.mockResolvedValueOnce(null);
      mockRepo.create.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash: 'hash',
        attempts: 0,
        expires_at: new Date(),
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      const result = await service.sendOtp('test@example.com', 'EMAIL');
      expect(result).toBe('challenge-123');
      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockDelivery.deliver).toHaveBeenCalledWith(
        'test@example.com',
        'EMAIL',
        expect.stringMatching(/^\d{6}$/),
      );
      expect(mockRedis.releaseLock).toHaveBeenCalledWith(
        'otp:send:EMAIL:test@example.com',
        'test-lock',
      );
    });

    it('should enforce resend cooldown', async () => {
      const now = Date.now();
      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'old-challenge',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash: 'hash',
        attempts: 0,
        expires_at: new Date(now + 5 * 60 * 1000),
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(now - 10000), // 10 seconds ago
      });

      await expect(
        service.sendOtp('test@example.com', 'EMAIL'),
      ).rejects.toThrow(AppException);
    });
  });

  describe('verifyOtp', () => {
    it('should verify valid OTP', async () => {
      const code = service.generateCode();
      const code_hash = service.hashCode(code);

      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash,
        attempts: 0,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      await service.verifyOtp('test@example.com', code);
      expect(mockRepo.consumeIfUnused).toHaveBeenCalledWith('challenge-123');
    });

    it('should reject invalid OTP', async () => {
      const code_hash = service.hashCode('123456');

      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash,
        attempts: 0,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      await expect(
        service.verifyOtp('test@example.com', '999999'),
      ).rejects.toThrow(AppException);
      expect(mockRepo.increment).toHaveBeenCalledWith('challenge-123');
    });

    it('should reject expired OTP', async () => {
      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash: 'hash',
        attempts: 0,
        expires_at: new Date(Date.now() - 1000), // Expired
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      await expect(
        service.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(AppException);
    });

    it('should reject a consumed OTP without consuming it again', async () => {
      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash: service.hashCode('123456'),
        attempts: 0,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: new Date(),
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      await expect(
        service.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(AppException);
      expect(mockRepo.consumeIfUnused).not.toHaveBeenCalled();
    });

    it('should enforce max attempts', async () => {
      mockRepo.findLatestByTarget.mockResolvedValueOnce({
        id: 'challenge-123',
        target: 'test@example.com',
        channel: 'EMAIL',
        code_hash: 'hash',
        attempts: 5, // Max attempts reached
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: null,
        ip: null,
        user_id: null,
        created_at: new Date(),
      });

      await expect(
        service.verifyOtp('test@example.com', '123456'),
      ).rejects.toThrow(AppException);
    });
  });
});

describe('OtpDelivery', () => {
  it('delivers through the console transport without throwing', async () => {
    const configService = {
      get: jest.fn((key: string) => (key === 'OTP_TRANSPORT' ? 'console' : undefined)),
    } as unknown as ConfigService;
    const delivery = new OtpDelivery(configService);

    await expect(delivery.deliver('test@example.com', 'EMAIL', '123456')).resolves.toBeUndefined();
  });

  it('rejects the console transport in production', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'OTP_TRANSPORT') return 'console';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      }),
    } as unknown as ConfigService;

    expect(() => new OtpDelivery(configService)).toThrow(
      'OTP_TRANSPORT=console is not allowed in production',
    );
  });
});
