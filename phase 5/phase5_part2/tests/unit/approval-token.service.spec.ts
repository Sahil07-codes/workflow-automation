import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalTokenService } from './approval-token.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as crypto from 'crypto';

describe('ApprovalTokenService', () => {
  let service: ApprovalTokenService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalTokenService,
        {
          provide: PrismaService,
          useValue: {
            approvalToken: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ApprovalTokenService>(ApprovalTokenService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = service.generateToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('createApprovalToken', () => {
    it('should create a token with correct hash', async () => {
      const appId = 'app-123';
      const payloadHash = 'payload-hash-123';

      (prisma.approvalToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.approvalToken.create as jest.Mock).mockResolvedValue({
        id: 'token-id',
        applicationId: appId,
        tokenHash: 'hashed',
        expiresAt: new Date(),
      });

      const result = await service.createApprovalToken(
        appId,
        payloadHash,
        48,
      );

      expect(result.plaintext_token).toHaveLength(64);
      expect(result.approval).toBeDefined();
    });
  });

  describe('verifyAndUseToken', () => {
    it('should reject expired tokens', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 1);

      (prisma.approvalToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'token-1',
        expiresAt: expiredDate,
        usedAt: null,
        tokenHash: 'hash',
      });

      expect(async () => {
        await service.verifyAndUseToken(
          'any-token',
          'app-123',
          '127.0.0.1',
          'test-agent',
        );
      }).rejects.toThrow('expired');
    });

    it('should reject already-used tokens', async () => {
      (prisma.approvalToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'token-1',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        usedAt: new Date(),
        tokenHash: 'hash',
      });

      expect(async () => {
        await service.verifyAndUseToken(
          'any-token',
          'app-123',
          '127.0.0.1',
          'test-agent',
        );
      }).rejects.toThrow('already been used');
    });
  });
});
