import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PaymentRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.payment.create({ data });
  }

  async findByRazorpayId(razorpayPaymentId: string) {
    return this.prisma.payment.findUnique({ where: { razorpayPaymentId } });
  }

  async findByUserId(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.payment.update({ where: { id }, data });
  }
}
