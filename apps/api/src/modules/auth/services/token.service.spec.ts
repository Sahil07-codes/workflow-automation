import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '@/common/exceptions/app.exception';

describe('TokenService', () => {
  let service: TokenService;
  let mockRepo: jest.Mocked<RefreshTokenRepository>;
  let mockJwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      findByHash: jest.fn(),
      findById: jest.fn(),
      markUsedIfUnused: jest.fn().mockResolvedValue(true),
      touchActiveSession: jest.fn().mockResolvedValue(true),
      revokeFamily: jest.fn(),
      revokeByUserId: jest.fn(),
    } as any;

    mockJwtService = {
      sign: jest.fn().mockReturnValue('access-token'),
      verify: jest.fn(),
      decode: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: RefreshTokenRepository, useValue: mockRepo },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('createAccessToken', () => {
    it('should create valid JWT', () => {
      const token = service.createAccessToken(
        'user-123',
        'test@example.com',
        'USER',
        'session-123',
      );

      expect(token).toBe('access-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-123',
          email: 'test@example.com',
          role: 'USER',
          sid: 'session-123',
        }),
      );
    });
  });

  describe('createRefreshToken', () => {
    it('should create and store refresh token', async () => {
      mockRepo.create.mockResolvedValueOnce({
        id: 'token-123',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: null,
        revoked_at: null,
        expires_at: new Date(),
        last_activity_at: new Date(),
        user_agent: 'test-agent',
        ip: null,
        created_at: new Date(),
      });

      const token = await service.createRefreshToken('user-123');

      expect(token).toBeTruthy();
      expect(mockRepo.create).toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('should issue new tokens on valid refresh', async () => {
      const mockToken = {
        id: 'token-123',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        last_activity_at: new Date(),
        user_agent: 'agent',
        ip: null,
        created_at: new Date(),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'USER',
          status: 'ACTIVE',
        },
      };

      mockRepo.findByHash.mockResolvedValueOnce(mockToken as any);
      mockRepo.markUsedIfUnused.mockResolvedValueOnce(true);

      const result = await service.refreshAccessToken('old-refresh-token');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockRepo.markUsedIfUnused).toHaveBeenCalledWith('token-123');
      expect(mockRepo.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ family_id: 'family-123' }),
      );
    });

    it('should revoke the family when another request already consumed the token', async () => {
      const mockToken = {
        id: 'token-123',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        last_activity_at: new Date(),
        user_agent: 'agent',
        ip: null,
        created_at: new Date(),
        user: { id: 'user-123', email: 'test@example.com', role: 'USER' },
      };
      mockRepo.findByHash.mockResolvedValueOnce(mockToken as any);
      mockRepo.markUsedIfUnused.mockResolvedValueOnce(false);

      await expect(
        service.refreshAccessToken('raced-refresh-token'),
      ).rejects.toThrow(AppException);

      expect(mockRepo.revokeFamily).toHaveBeenCalledWith('family-123');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should reject invalid refresh token', async () => {
      mockRepo.findByHash.mockResolvedValueOnce(null);

      await expect(
        service.refreshAccessToken('invalid-token'),
      ).rejects.toThrow(AppException);
    });

    it('should revoke family on reuse detection', async () => {
      const mockToken = {
        id: 'token-123',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: new Date(), // Already used = reuse attempt
        revoked_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        last_activity_at: new Date(),
        user_agent: 'agent',
        ip: null,
        created_at: new Date(),
        user: { id: 'user-123', email: 'test@example.com', role: 'USER' },
      };

      mockRepo.findByHash.mockResolvedValueOnce(mockToken as any);

      await expect(
        service.refreshAccessToken('reused-token'),
      ).rejects.toThrow(AppException);

      expect(mockRepo.revokeFamily).toHaveBeenCalledWith('family-123');
    });

    it('should reject expired refresh token', async () => {
      const mockToken = {
        id: 'token-123',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() - 1000), // Expired
        last_activity_at: new Date(),
        user_agent: 'agent',
        ip: null,
        created_at: new Date(),
        user: { id: 'user-123', email: 'test@example.com', role: 'USER' },
      };

      mockRepo.findByHash.mockResolvedValueOnce(mockToken as any);

      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(AppException);
    });

    it('should reject refresh after one hour without authenticated activity', async () => {
      const lastActivity = new Date(Date.now() - 60 * 60 * 1000 - 1000);
      mockRepo.findByHash.mockResolvedValueOnce({
        id: 'token-idle',
        user_id: 'user-123',
        family_id: 'family-123',
        token_hash: 'hash',
        used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        last_activity_at: lastActivity,
        created_at: lastActivity,
        user: { id: 'user-123', email: 'test@example.com', role: 'USER' },
      } as any);

      await expect(service.refreshAccessToken('idle-refresh-token')).rejects.toThrow(
        'Refresh token expired.',
      );
      expect(mockRepo.markUsedIfUnused).not.toHaveBeenCalled();
    });
  });

  describe('touchSession', () => {
    it('extends an active session after authenticated activity', async () => {
      mockRepo.touchActiveSession.mockResolvedValueOnce(true);

      await expect(service.touchSession('family-123')).resolves.toBeUndefined();

      expect(mockRepo.touchActiveSession).toHaveBeenCalledWith(
        'family-123',
        expect.any(Date),
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('rejects a session after the idle timeout', async () => {
      mockRepo.touchActiveSession.mockResolvedValueOnce(false);

      await expect(service.touchSession('family-123')).rejects.toThrow(
        'Your session expired due to inactivity.',
      );
    });
  });

  describe('revokeAllTokens', () => {
    it('should revoke all user tokens', async () => {
      await service.revokeAllTokens('user-123');
      expect(mockRepo.revokeByUserId).toHaveBeenCalledWith('user-123');
    });
  });
});
