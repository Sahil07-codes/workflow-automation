import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { AppException } from '@/common/exceptions/app.exception';

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  async getPreferences(userId: string) {
    let prefs = await this.prisma.jobPreferences.findUnique({
      where: { user_id: userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await this.prisma.jobPreferences.create({
        data: {
          user_id: userId,
          min_match_score: 60,
          daily_cap: 25,
        },
      });
    }

    return prefs;
  }

  async updatePreferences(userId: string, data: any) {
    // Validate inputs
    if (data.min_match_score !== undefined) {
      if (data.min_match_score < 0 || data.min_match_score > 100) {
        throw new AppException(
          'VALIDATION_ERROR',
          'Match score must be between 0 and 100.',
          400,
        );
      }
    }

    if (data.daily_cap !== undefined) {
      if (data.daily_cap < 1 || data.daily_cap > 500) {
        throw new AppException(
          'VALIDATION_ERROR',
          'Daily cap must be between 1 and 500.',
          400,
        );
      }
    }

    if (data.remote_preference && !['ONSITE', 'HYBRID', 'REMOTE'].includes(data.remote_preference)) {
      throw new AppException(
        'VALIDATION_ERROR',
        'Remote preference must be ONSITE, HYBRID, or REMOTE.',
        400,
      );
    }

    let prefs = await this.prisma.jobPreferences.findUnique({
      where: { user_id: userId },
    });

    if (!prefs) {
      // Create if doesn't exist
      return this.prisma.jobPreferences.create({
        data: {
          user_id: userId,
          ...data,
        },
      });
    }

    // Update existing
    return this.prisma.jobPreferences.update({
      where: { user_id: userId },
      data,
    });
  }

  async setAutoApprove(userId: string, config: any) {
    return this.prisma.jobPreferences.update({
      where: { user_id: userId },
      data: {
        auto_approve: config,
      },
    });
  }

  async resetToDefaults(userId: string) {
    return this.prisma.jobPreferences.update({
      where: { user_id: userId },
      data: {
        roles: [],
        locations: [],
        remote_preference: null,
        min_salary_inr: null,
        excluded_companies: [],
        min_match_score: 60,
        daily_cap: 25,
        auto_approve: Prisma.DbNull,
      },
    });
  }
}
