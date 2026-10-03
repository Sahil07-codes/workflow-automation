import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PaymentRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.payment.create({ data });
  }

  async findByRazorpayId(razorpayPaymentId: string) {
    return this.prisma.payment.findUnique({ where: { razorpay_payment_id: razorpayPaymentId } });
  }

  async findByUserId(userId: string) {
    return this.prisma.payment.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } });
  }

  async update(id: string, data: any) {
    return this.prisma.payment.update({ where: { id }, data });
  }
}
