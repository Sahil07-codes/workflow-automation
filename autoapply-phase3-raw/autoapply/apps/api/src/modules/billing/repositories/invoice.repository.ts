import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class InvoiceRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.invoice.create({ data });
  }

  async findByPaymentId(paymentId: string) {
    return this.prisma.invoice.findFirst({ where: { payment_id: paymentId } });
  }

  async findByInvoiceNo(invoiceNo: string) {
    return this.prisma.invoice.findUnique({ where: { invoice_no: invoiceNo } });
  }

  async findByUserId(userId: string, paymentIds: string[]) {
    return this.prisma.invoice.findMany({
      where: { payment_id: { in: paymentIds } },
      orderBy: { created_at: 'desc' },
    });
  }
}
