import { AppError } from '@oppsera/shared';

export class InvoiceStatusError extends AppError {
  constructor(invoiceId: string, currentStatus: string, expectedStatus: string) {
    super(
      'INVOICE_STATUS_ERROR',
      `Invoice ${invoiceId} is ${currentStatus}, expected ${expectedStatus}`,
      409,
    );
  }
}

export class DuplicateInvoiceNumberError extends AppError {
  constructor(invoiceNumber: string) {
    super('DUPLICATE_INVOICE_NUMBER', `Invoice number ${invoiceNumber} already exists`, 409);
  }
}

export class ReceiptExceedsInvoiceError extends AppError {
  constructor(invoiceId: string) {
    super('RECEIPT_EXCEEDS_INVOICE', `Receipt allocation exceeds invoice ${invoiceId} balance`, 400);
  }
}

export class ReceiptStatusError extends AppError {
  constructor(receiptId: string, currentStatus: string, expectedStatus: string) {
    super(
      'RECEIPT_STATUS_ERROR',
      `Receipt ${receiptId} is ${currentStatus}, expected ${expectedStatus}`,
      409,
    );
  }
}
