export const AR_EVENTS = {
  INVOICE_CREATED: 'ar.invoice.created.v1',
  INVOICE_POSTED: 'ar.invoice.posted.v1',
  INVOICE_VOIDED: 'ar.invoice.voided.v1',
  RECEIPT_CREATED: 'ar.receipt.created.v1',
  RECEIPT_POSTED: 'ar.receipt.posted.v1',
  RECEIPT_VOIDED: 'ar.receipt.voided.v1',
} as const;

export interface InvoiceCreatedPayload {
  invoiceId: string;
  customerId: string;
  invoiceNumber: string;
  totalAmount: string;
}

export interface InvoicePostedPayload {
  invoiceId: string;
  customerId: string;
  invoiceNumber: string;
  totalAmount: string;
  glJournalEntryId: string;
}

export interface InvoiceVoidedPayload {
  invoiceId: string;
  customerId: string;
  invoiceNumber: string;
  totalAmount: string;
  reason: string;
}

export interface ReceiptPostedPayload {
  receiptId: string;
  customerId: string;
  amount: string;
  glJournalEntryId: string;
}

export interface ReceiptVoidedPayload {
  receiptId: string;
  customerId: string;
  amount: string;
  reason: string;
}
