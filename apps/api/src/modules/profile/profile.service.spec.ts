import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService } from './profile.service';
import { PrismaService } from '@/database/prisma.service';
import { ProfileEncryptionService } from './services/profile-encryption.service';
import { AppException } from '@/common/exceptions/app.exception';

describe('ProfileService', () => {
  let service: ProfileService;
  let mockPrisma: {
    profile: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    profileVersion: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    jobPreferences: {
      findUnique: jest.Mock;
    };
  };
  let mockEncryption: jest.Mocked<ProfileEncryptionService>;

  beforeEach(async () => {
    mockPrisma = {
      profile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      profileVersion: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      jobPreferences: {
        findUnique: jest.fn(),
      },
    } as any;

    mockEncryption = {
      encryptProfileData: jest.fn(),
      decryptProfileData: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfileEncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  describe('getProfile', () => {
    it('should retrieve and decrypt profile', async () => {
      const mockProfile = {
        user_id: 'user-123',
        data_enc: Buffer.from('encrypted'),
        dek_wrapped: Buffer.from('wrapped'),
        current_version: 1,
        confirmed_at: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValueOnce(mockProfile as any);
      mockEncryption.decryptProfileData.mockResolvedValueOnce({
        education: [],
        experience: [],
      });

      const result = await service.getProfile('user-123');

      expect(result.user_id).toBe('user-123');
      expect(result.version).toBe(1);
      expect(mockEncryption.decryptProfileData).toHaveBeenCalled();
    });

    it('should return an empty profile when one has not been created', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce(null);

      await expect(service.getProfile('nonexistent')).resolves.toEqual({
        user_id: 'nonexistent',
        data: {},
        version: 0,
        confirmed_at: null,
      });
    });
  });

  describe('createProfile', () => {
    it('should create new profile with versioning', async () => {
      const profileData = { education: [], experience: [] };

      mockPrisma.profile.findUnique.mockResolvedValueOnce(null);
      mockEncryption.encryptProfileData.mockResolvedValueOnce({
        data_enc: Buffer.from('encrypted'),
        dek_wrapped: Buffer.from('wrapped'),
      });
      mockPrisma.profile.create.mockResolvedValueOnce({
        user_id: 'user-123',
        data_enc: Buffer.from('encrypted'),
        dek_wrapped: Buffer.from('wrapped'),
        current_version: 1,
        confirmed_at: null,
      });
      mockPrisma.profileVersion.create.mockResolvedValueOnce({
        user_id: 'user-123',
        version: 1,
        data_enc: Buffer.from('encrypted'),
        created_at: new Date(),
      });

      const result = await service.createProfile('user-123', profileData);

      expect(result.version).toBe(1);
      expect(mockPrisma.profileVersion.create).toHaveBeenCalled();
    });

    it('should reject if profile already exists', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        user_id: 'user-123',
      } as any);

      await expect(
        service.createProfile('user-123', {}),
      ).rejects.toThrow(AppException);
    });
  });

  describe('updateProfile', () => {
    it('should increment version on update', async () => {
      const profileData = { education: [], experience: [] };

      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        user_id: 'user-123',
        current_version: 1,
      } as any);

      mockEncryption.encryptProfileData.mockResolvedValueOnce({
        data_enc: Buffer.from('encrypted'),
        dek_wrapped: Buffer.from('wrapped'),
      });

      mockPrisma.profile.update.mockResolvedValueOnce({
        user_id: 'user-123',
        current_version: 2,
        data_enc: Buffer.from('encrypted'),
        dek_wrapped: Buffer.from('wrapped'),
      } as any);

      mockPrisma.profileVersion.create.mockResolvedValueOnce({
        user_id: 'user-123',
        version: 2,
        data_enc: Buffer.from('encrypted'),
        created_at: new Date(),
      });

      const result = await service.updateProfile('user-123', profileData);

      expect(result.version).toBe(2);
      expect(mockPrisma.profileVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2 }),
        }),
      );
    });
  });

  describe('confirmProfile', () => {
    it('should confirm onboarding after all required details are present', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        user_id: 'user-123',
        data_enc: Buffer.from('encrypted'),
      } as any);
      mockEncryption.decryptProfileData.mockResolvedValueOnce({
        full_name: 'Test User',
        location: 'New Delhi',
        linkedin_url: 'https://www.linkedin.com/in/test-user',
        professional_status: 'experienced_professional',
        current_title: 'Engineer',
        years_experience: '3–5 years',
        current_company: 'Example Co',
        profile_visibility: 'private',
      });
      mockPrisma.jobPreferences.findUnique.mockResolvedValueOnce({
        roles: ['Engineer'],
        locations: ['New Delhi'],
        skills: ['TypeScript'],
        remote_preference: 'HYBRID',
      });
      mockPrisma.profile.update.mockResolvedValueOnce({
        user_id: 'user-123',
        confirmed_at: new Date(),
        current_version: 1,
      } as any);

      const result = await service.confirmProfile('user-123');

      expect(result.confirmed_at).toBeTruthy();
      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confirmed_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should not confirm onboarding when required details are missing', async () => {
      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        user_id: 'user-123',
        data_enc: Buffer.from('encrypted'),
      } as any);
      mockEncryption.decryptProfileData.mockResolvedValueOnce({
        full_name: 'Test User',
      });
      mockPrisma.jobPreferences.findUnique.mockResolvedValueOnce(null);

      await expect(service.confirmProfile('user-123')).rejects.toThrow(
        'Complete all required profile, preference, and privacy details before confirming your profile.',
      );
      expect(mockPrisma.profile.update).not.toHaveBeenCalled();
    });
  });

  describe('getProfileVersions', () => {
    it('should list all profile versions', async () => {
      mockPrisma.profileVersion.findMany.mockResolvedValueOnce([
        { version: 3, created_at: new Date() },
        { version: 2, created_at: new Date() },
        { version: 1, created_at: new Date() },
      ] as any);

      const result = await service.getProfileVersions('user-123');

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(3);
    });
  });
});
