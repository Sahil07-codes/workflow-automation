import { Injectable } from '@nestjs/common';
import { InvoiceRepository } from '../repositories/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(private invoiceRepo: InvoiceRepository) {}

  async generateInvoice(userId: string, amountPaise: number) {
    const invoiceNo = `INV-${Date.now()}`;
    const taxablePaise = Math.floor(amountPaise / 1.18);
    const gstPaise = amountPaise - taxablePaise;

    return this.invoiceRepo.create({
      invoice_no: invoiceNo,
      gstin: 'PLACEHOLDER_GSTIN',
      taxable_paise: taxablePaise,
      gst_paise: gstPaise,
      pdf_key: null, // S3 key for PDF, generated post-Phase 3
    });
  }

  async getInvoices(paymentIds: string[]) {
    return this.invoiceRepo.findByUserId('', paymentIds);
  }
}
