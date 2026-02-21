import { z } from 'zod';

// ── Invoice Statuses ─────────────────────────────────────────────
export const INVOICE_STATUSES = ['draft', 'posted', 'partial', 'paid', 'voided'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ── Receipt Statuses ─────────────────────────────────────────────
export const RECEIPT_STATUSES = ['draft', 'posted', 'voided'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

// ── AR Source Types ──────────────────────────────────────────────
export const AR_SOURCE_TYPES = ['manual', 'membership', 'event', 'pos_house_account'] as const;
export type ArSourceType = (typeof AR_SOURCE_TYPES)[number];

// ── Receipt Source Types ─────────────────────────────────────────
export const RECEIPT_SOURCE_TYPES = ['manual', 'pos_tender', 'online_payment'] as const;
export type ReceiptSourceType = (typeof RECEIPT_SOURCE_TYPES)[number];

// ── AR Payment Methods ───────────────────────────────────────────
export const AR_PAYMENT_METHODS = ['cash', 'check', 'ach', 'wire', 'credit_card', 'other'] as const;
export type ArPaymentMethod = (typeof AR_PAYMENT_METHODS)[number];

// ── Invoice Line Schema ─────────────────────────────────────────
export const invoiceLineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().min(1).max(500),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Quantity must be a positive decimal').optional().default('1'),
  unitPrice: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Unit price must be a valid decimal').optional().default('0'),
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid decimal'),
  taxGroupId: z.string().optional(),
  taxAmount: z.string().regex(/^-?\d+(\.\d{1,2})?$/).optional().default('0'),
  sortOrder: z.number().int().optional().default(0),
});

export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;

// ── Create Invoice Schema ────────────────────────────────────────
export const createInvoiceSchema = z.object({
  customerId: z.string().min(1),
  billingAccountId: z.string().optional(),
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  memo: z.string().max(1000).optional(),
  locationId: z.string().optional(),
  sourceType: z.enum(AR_SOURCE_TYPES).optional().default('manual'),
  sourceReferenceId: z.string().optional(),
  lines: z.array(invoiceLineSchema).min(1),
  clientRequestId: z.string().optional(),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;

// ── Post Invoice Schema ──────────────────────────────────────────
export const postInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  forcePost: z.boolean().optional().default(false),
});

export type PostInvoiceInput = z.input<typeof postInvoiceSchema>;

// ── Void Invoice Schema ──────────────────────────────────────────
export const voidInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type VoidInvoiceInput = z.input<typeof voidInvoiceSchema>;

// ── Receipt Allocation Schema ────────────────────────────────────
export const receiptAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal'),
});

export type ReceiptAllocationInput = z.input<typeof receiptAllocationSchema>;

// ── Create Receipt Schema ────────────────────────────────────────
export const createReceiptSchema = z.object({
  customerId: z.string().min(1),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  paymentMethod: z.enum(AR_PAYMENT_METHODS).optional(),
  referenceNumber: z.string().max(100).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal'),
  bankAccountId: z.string().optional(),
  sourceType: z.enum(RECEIPT_SOURCE_TYPES).optional().default('manual'),
  sourceReferenceId: z.string().optional(),
  allocations: z.array(receiptAllocationSchema).min(1),
  clientRequestId: z.string().optional(),
});

export type CreateReceiptInput = z.input<typeof createReceiptSchema>;

// ── Post Receipt Schema ──────────────────────────────────────────
export const postReceiptSchema = z.object({
  receiptId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type PostReceiptInput = z.input<typeof postReceiptSchema>;

// ── Void Receipt Schema ──────────────────────────────────────────
export const voidReceiptSchema = z.object({
  receiptId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type VoidReceiptInput = z.input<typeof voidReceiptSchema>;
