import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SubscriptionRepository {
  constructor(private prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        plan: true,
        renewalOption: true,
      },
    });
  }

  async findByRazorpayId(razorpaySubId: string) {
    return this.prisma.subscription.findUnique({ where: { razorpaySubId } });
  }

  async create(data: any) {
    return this.prisma.subscription.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.subscription.update({ where: { id }, data });
  }

  async findById(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, renewalOption: true },
    });
  }
}
