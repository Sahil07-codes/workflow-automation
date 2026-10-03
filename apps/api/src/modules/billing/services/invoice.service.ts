import { Injectable } from '@nestjs/common';
import { InvoiceRepository } from '../repositories/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(private invoiceRepo: InvoiceRepository) {}

  async generateInvoice(_userId: string, amountPaise: number) {
    const invoiceNo = `INV-${Date.now()}`;
    const taxablePaise = Math.floor(amountPaise / 1.18);
    const gstPaise = amountPaise - taxablePaise;

    return this.invoiceRepo.create({
      invoiceNo,
      gstin: 'PLACEHOLDER_GSTIN',
      taxablePaise,
      gstPaise,
      pdfKey: null,
    });
  }

  async getInvoices(paymentIds: string[]) {
    return this.invoiceRepo.findByUserId('', paymentIds);
  }
}
