// Module metadata
export const MODULE_KEY = 'ar' as const;
export const MODULE_NAME = 'Accounts Receivable';
export const MODULE_VERSION = '0.0.0';

/** SQL tables owned by this module — used by extraction tooling */
export const MODULE_TABLES = [
  'ar_invoices',
  'ar_invoice_lines',
  'ar_receipts',
  'ar_receipt_allocations',
] as const;

// Commands
export { createInvoice } from './commands/create-invoice';
export { postInvoice } from './commands/post-invoice';
export { voidInvoice } from './commands/void-invoice';
export { createReceipt } from './commands/create-receipt';
export { postReceipt } from './commands/post-receipt';
export { voidReceipt } from './commands/void-receipt';
export { bridgeArTransaction } from './commands/bridge-ar-transaction';

// Errors
export {
  InvoiceStatusError,
  DuplicateInvoiceNumberError,
  ReceiptExceedsInvoiceError,
  ReceiptStatusError,
} from './errors';

// Queries
export { getArAging } from './queries/get-ar-aging';
export type { ArAgingCustomerRow, ArAgingReport } from './queries/get-ar-aging';
export { getCustomerLedger } from './queries/get-customer-ledger';
export type { CustomerLedgerEntry, CustomerLedgerResult } from './queries/get-customer-ledger';
export { getOpenInvoices } from './queries/get-open-invoices';
export type { OpenInvoiceItem, GetOpenInvoicesResult } from './queries/get-open-invoices';
export { listInvoices } from './queries/list-invoices';
export type { InvoiceListItem, ListInvoicesResult } from './queries/list-invoices';
export { getInvoice } from './queries/get-invoice';
export type { InvoiceDetail, InvoiceLine, InvoiceAllocation } from './queries/get-invoice';
export { listReceipts } from './queries/list-receipts';
export type { ReceiptListItem, ListReceiptsResult } from './queries/list-receipts';
export { getReconciliationAr } from './queries/get-reconciliation-ar';
export type { ArReconciliationResult } from './queries/get-reconciliation-ar';

// Event types
export { AR_EVENTS } from './events/types';
export type {
  InvoiceCreatedPayload,
  InvoicePostedPayload,
  InvoiceVoidedPayload,
  ReceiptPostedPayload,
  ReceiptVoidedPayload,
} from './events/types';

// Validation schemas
export {
  createInvoiceSchema,
  postInvoiceSchema,
  voidInvoiceSchema,
  invoiceLineSchema,
  createReceiptSchema,
  postReceiptSchema,
  voidReceiptSchema,
  receiptAllocationSchema,
  INVOICE_STATUSES,
  RECEIPT_STATUSES,
  AR_SOURCE_TYPES,
  RECEIPT_SOURCE_TYPES,
  AR_PAYMENT_METHODS,
} from './validation';
export type {
  CreateInvoiceInput,
  PostInvoiceInput,
  VoidInvoiceInput,
  InvoiceLineInput,
  CreateReceiptInput,
  PostReceiptInput,
  VoidReceiptInput,
  ReceiptAllocationInput,
  InvoiceStatus,
  ReceiptStatus,
  ArSourceType,
  ReceiptSourceType,
  ArPaymentMethod,
} from './validation';
