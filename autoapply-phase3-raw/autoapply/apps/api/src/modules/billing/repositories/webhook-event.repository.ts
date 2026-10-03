import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class WebhookEventRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      return await this.prisma.webhook_event.create({ data });
    } catch (err: any) {
      if (err.code === 'P2002') return null; // Duplicate, idempotent
      throw err;
    }
  }

  async findByProviderEventId(provider: string, providerEventId: string) {
    return this.prisma.webhook_event.findUnique({
      where: { provider_provider_event_id: { provider, provider_event_id: providerEventId } },
    });
  }

  async markProcessed(id: string) {
    return this.prisma.webhook_event.update({
      where: { id },
      data: { status: 'PROCESSED', processed_at: new Date() },
    });
  }
}
