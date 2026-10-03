import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class WebhookEventRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      return await this.prisma.webhookEvent.create({ data });
    } catch (err: any) {
      if (err.code === 'P2002') return null; // Duplicate, idempotent
      throw err;
    }
  }

  async findByProviderEventId(provider: string, providerEventId: string) {
    return this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
    });
  }

  async markProcessed(id: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  }
}
