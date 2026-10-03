import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { ProfileEncryptionService } from './services/profile-encryption.service';
import { AppException } from '@/common/exceptions/app.exception';

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: ProfileEncryptionService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new AppException('PROFILE_NOT_FOUND', 'Profile not found.', 404);
    }

    // Decrypt the profile data
    const decryptedData = await this.encryptionService.decryptProfileData(
      profile.data_enc,
      profile.dek_wrapped,
    );

    return {
      user_id: profile.user_id,
      data: decryptedData,
      version: profile.current_version,
      confirmed_at: profile.confirmed_at,
    };
  }

  async createProfile(userId: string, profileData: any) {
    // Check if profile already exists
    const existing = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (existing) {
      throw new AppException('PROFILE_EXISTS', 'Profile already exists.', 409);
    }

    // Encrypt the profile data
    const { data_enc, dek_wrapped } =
      await this.encryptionService.encryptProfileData(profileData);

    // Create profile
    const profile = await this.prisma.profile.create({
      data: {
        user_id: userId,
        data_enc,
        dek_wrapped,
        current_version: 1,
      },
    });

    // Create version snapshot
    await this.prisma.profileVersion.create({
      data: {
        user_id: userId,
        version: 1,
        data_enc,
      },
    });

    return {
      user_id: profile.user_id,
      data: profileData,
      version: profile.current_version,
    };
  }

  async updateProfile(userId: string, profileData: any) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new AppException('PROFILE_NOT_FOUND', 'Profile not found.', 404);
    }

    // Encrypt new data
    const { data_enc, dek_wrapped } =
      await this.encryptionService.encryptProfileData(profileData);

    // Increment version
    const newVersion = profile.current_version + 1;

    // Update profile
    const updated = await this.prisma.profile.update({
      where: { user_id: userId },
      data: {
        data_enc,
        dek_wrapped,
        current_version: newVersion,
      },
    });

    // Create version snapshot (immutable)
    await this.prisma.profileVersion.create({
      data: {
        user_id: userId,
        version: newVersion,
        data_enc,
      },
    });

    return {
      user_id: updated.user_id,
      data: profileData,
      version: updated.current_version,
    };
  }

  async confirmProfile(userId: string) {
    return this.prisma.profile.update({
      where: { user_id: userId },
      data: { confirmed_at: new Date() },
      select: {
        user_id: true,
        current_version: true,
        confirmed_at: true,
      },
    });
  }

  async getProfileVersions(userId: string) {
    return this.prisma.profileVersion.findMany({
      where: { user_id: userId },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        created_at: true,
      },
    });
  }
}
