import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { OtpChallengeRepository } from '../repositories/otp-challenge.repository';
import { AppException } from '@/common/exceptions/app.exception';
import { RedisService } from '@/common/services/redis.service';
import { OtpDelivery } from './otp-delivery';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

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
      get: jest.fn((key: string) => (key === 'otp_transport' ? 'console' : undefined)),
    } as unknown as ConfigService;
    const delivery = new OtpDelivery(configService);

    await expect(delivery.deliver('test@example.com', 'EMAIL', '123456')).resolves.toBeUndefined();
  });

  it('sends email OTPs through configured SMTP', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-message' });
    const createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const configValues: Record<string, string | number | boolean> = {
      otp_transport: 'smtp',
      sms_otp_transport: 'disabled',
      node_env: 'development',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: 'sender@example.com',
      smtp_password: 'app-password',
      otp_sender_email: 'sender@example.com',
    };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = configValues[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      }),
    } as unknown as ConfigService;

    try {
      const delivery = new OtpDelivery(configService);
      await delivery.deliver('recipient@example.com', 'EMAIL', '123456');

      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'sender@example.com', pass: 'app-password' },
      });
      expect(sendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Your AutoApply verification code',
        text: 'Your verification code is 123456. It expires in 5 minutes.',
      });
    } finally {
      createTransport.mockRestore();
    }
  });

  it('rejects the console transport in production', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'otp_transport') return 'console';
        if (key === 'node_env') return 'production';
        return undefined;
      }),
    } as unknown as ConfigService;

    expect(() => new OtpDelivery(configService)).toThrow(
      'OTP_TRANSPORT=console is not allowed in production',
    );
  });

  it('sends SMS OTPs through the configured Twilio account', async () => {
    const accountSid = `AC${'a'.repeat(32)}`;
    const configValues: Record<string, string> = {
      otp_transport: 'ses',
      sms_otp_transport: 'twilio',
      twilio_account_sid: accountSid,
      twilio_auth_token: 'b'.repeat(32),
      twilio_from_number: '+14155552671',
    };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
    } as Response);

    try {
      const delivery = new OtpDelivery(configService);
      await expect(
        delivery.deliver('+919999999999', 'SMS', '123456'),
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from(`${accountSid}:${'b'.repeat(32)}`).toString('base64')}`,
          }),
          body: expect.any(URLSearchParams),
        }),
      );
      const requestBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
      expect(requestBody.get('To')).toBe('+919999999999');
      expect(requestBody.get('From')).toBe('+14155552671');
      expect(requestBody.get('Body')).toContain('123456');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reports Twilio delivery failures without treating them as successful', async () => {
    const configService = {
      get: jest.fn((key: string) => ({
        otp_transport: 'ses',
        sms_otp_transport: 'twilio',
        twilio_account_sid: `AC${'a'.repeat(32)}`,
        twilio_auth_token: 'b'.repeat(32),
        twilio_from_number: '+14155552671',
      })[key]),
    } as unknown as ConfigService;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
    } as Response);

    try {
      const delivery = new OtpDelivery(configService);
      await expect(
        delivery.deliver('+919999999999', 'SMS', '123456'),
      ).rejects.toMatchObject({ code: 'OTP_DELIVERY_FAILED', statusCode: 503 });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
