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
      return {
        user_id: userId,
        data: {},
        version: 0,
        confirmed_at: null,
      };
    }

    // Decrypt the profile data
    const decryptedData = await this.encryptionService.decryptProfileData(
      userId,
      profile.data_enc,
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
      await this.encryptionService.encryptProfileData(userId, profileData);

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
      await this.encryptionService.encryptProfileData(userId, profileData);

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
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) {
      throw new AppException(
        'PROFILE_NOT_FOUND',
        'Complete your profile before confirming onboarding.',
        404,
      );
    }

    const profileData = await this.encryptionService.decryptProfileData(
      userId,
      profile.data_enc,
    );
    const preferences = await this.prisma.jobPreferences.findUnique({
      where: { user_id: userId },
    });
    if (!this.hasCompletedOnboarding(profileData, preferences)) {
      throw new AppException(
        'ONBOARDING_INCOMPLETE',
        'Complete all required profile, preference, and privacy details before confirming your profile.',
        400,
      );
    }

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

  private hasCompletedOnboarding(
    profileData: Record<string, unknown>,
    preferences: {
      roles: string[];
      locations: string[];
      skills: string[];
      remote_preference: string | null;
    } | null,
  ): boolean {
    const hasProfileValue = (key: string) => {
      const value = profileData[key];
      return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number';
    };
    const professionalStatus = profileData.professional_status;
    const professionalComplete =
      professionalStatus === 'student_recent_graduate'
        ? ['education_level', 'institution', 'field_of_study'].every(
            hasProfileValue,
          ) &&
          hasProfileValue('graduation_year') &&
          Number.isFinite(Number(profileData.graduation_year))
        : professionalStatus === 'experienced_professional'
          ? ['current_title', 'years_experience', 'current_company'].every(
              hasProfileValue,
            )
          : false;
    const hasEntries = (values: string[] | undefined) =>
      Array.isArray(values) &&
      values.some((value) => typeof value === 'string' && value.trim().length > 0);

    return (
      ['full_name', 'location', 'linkedin_url'].every(hasProfileValue) &&
      professionalComplete &&
      hasProfileValue('profile_visibility') &&
      Boolean(preferences) &&
      hasEntries(preferences?.roles) &&
      hasEntries(preferences?.locations) &&
      hasEntries(preferences?.skills) &&
      ['ONSITE', 'HYBRID', 'REMOTE'].includes(
        preferences?.remote_preference ?? '',
      )
    );
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
