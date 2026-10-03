import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class FormDetectionCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertFormSchema(jobId: string, schema: Prisma.InputJsonValue) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.formDetectionCache.upsert({
      where: { jobId },
      update: { schema, expiresAt, parsedAt: new Date() },
      create: { jobId, schema, expiresAt },
    });
  }

  async findByJobId(jobId: string) {
    const cache = await this.prisma.formDetectionCache.findUnique({
      where: { jobId },
    });
    if (cache && cache.expiresAt <= new Date()) {
      await this.prisma.formDetectionCache.deleteMany({ where: { jobId } });
      return null;
    }
    return cache;
  }

  deleteByJobId(jobId: string) {
    return this.prisma.formDetectionCache.deleteMany({ where: { jobId } });
  }

  async getStats() {
    const [total, expired] = await Promise.all([
      this.prisma.formDetectionCache.count(),
      this.prisma.formDetectionCache.count({
        where: { expiresAt: { lt: new Date() } },
      }),
    ]);
    return { total, expired, active: total - expired };
  }
}
