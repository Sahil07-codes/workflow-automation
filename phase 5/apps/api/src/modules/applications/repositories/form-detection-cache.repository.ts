import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class FormDetectionCacheRepository {
  constructor(private prisma: PrismaService) {}

  async upsertFormSchema(
    jobId: string,
    schema: Record<string, unknown>,
    rawHtml?: string,
  ) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24h TTL

    return await this.prisma.formDetectionCache.upsert({
      where: { jobId },
      update: {
        schema,
        rawHtml,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        jobId,
        schema,
        rawHtml,
        expiresAt,
        parsedAt: new Date(),
      },
    });
  }

  async findByJobId(jobId: string) {
    const cache = await this.prisma.formDetectionCache.findUnique({
      where: { jobId },
    });

    // Check if expired
    if (cache && cache.expiresAt < new Date()) {
      await this.prisma.formDetectionCache.delete({ where: { jobId } });
      return null;
    }

    return cache;
  }

  async deleteByJobId(jobId: string) {
    return await this.prisma.formDetectionCache.delete({
      where: { jobId },
    }).catch(() => null); // Ignore if not found
  }

  async getStats() {
    const total = await this.prisma.formDetectionCache.count();
    const expired = await this.prisma.formDetectionCache.count({
      where: { expiresAt: { lt: new Date() } },
    });

    return {
      total,
      expired,
      active: total - expired,
    };
  }
}
