export const AP_EVENTS = {
  BILL_CREATED: 'ap.bill.created.v1',
  BILL_POSTED: 'ap.bill.posted.v1',
  BILL_VOIDED: 'ap.bill.voided.v1',
  BILL_PAID: 'ap.bill.paid.v1',
  PAYMENT_CREATED: 'ap.payment.created.v1',
  PAYMENT_POSTED: 'ap.payment.posted.v1',
  PAYMENT_VOIDED: 'ap.payment.voided.v1',
  PAYMENT_TERMS_CREATED: 'ap.payment_terms.created.v1',
  PAYMENT_TERMS_UPDATED: 'ap.payment_terms.updated.v1',
} as const;

export interface BillCreatedPayload {
  billId: string;
  vendorId: string;
  billNumber: string;
  totalAmount: string;
  dueDate: string;
}

export interface BillPostedPayload {
  billId: string;
  vendorId: string;
  billNumber: string;
  totalAmount: string;
  glJournalEntryId: string;
  businessDate: string;
}

export interface BillVoidedPayload {
  billId: string;
  vendorId: string;
  billNumber: string;
  totalAmount: string;
  reason: string;
  reversalJournalEntryId: string | null;
}

export interface BillPaidPayload {
  billId: string;
  vendorId: string;
  billNumber: string;
  totalAmount: string;
}

export interface PaymentCreatedPayload {
  paymentId: string;
  vendorId: string;
  amount: string;
  paymentMethod: string;
  allocations: Array<{ billId: string; amount: string }>;
}

export interface PaymentPostedPayload {
  paymentId: string;
  vendorId: string;
  amount: string;
  glJournalEntryId: string;
}

export interface PaymentVoidedPayload {
  paymentId: string;
  vendorId: string;
  amount: string;
  reason: string;
}
