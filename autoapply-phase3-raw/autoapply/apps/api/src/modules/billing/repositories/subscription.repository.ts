import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SubscriptionRepository {
  constructor(private prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.subscription.findFirst({ where: { user_id: userId }, orderBy: { updated_at: 'desc' } });
  }

  async findByRazorpayId(razorpaySubId: string) {
    return this.prisma.subscription.findUnique({ where: { razorpay_sub_id: razorpaySubId } });
  }

  async create(data: any) {
    return this.prisma.subscription.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.subscription.update({ where: { id }, data });
  }

  async findById(id: string) {
    return this.prisma.subscription.findUnique({ where: { id } });
  }
}
