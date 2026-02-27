import { z } from 'zod';

// ── Bill Statuses ─────────────────────────────────────────────────
export const BILL_STATUSES = ['draft', 'posted', 'partial', 'paid', 'voided'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

// ── Bill Line Types ───────────────────────────────────────────────
export const BILL_LINE_TYPES = ['item', 'expense', 'freight', 'tax', 'other'] as const;
export type BillLineType = (typeof BILL_LINE_TYPES)[number];

// ── Payment Methods ───────────────────────────────────────────────
export const AP_PAYMENT_METHODS = ['check', 'ach', 'wire', 'credit_card', 'cash', 'other'] as const;
export type ApPaymentMethod = (typeof AP_PAYMENT_METHODS)[number];

// ── Payment Term Types ────────────────────────────────────────────
export const PAYMENT_TERM_TYPES = ['net', 'due_on_receipt', 'eom', 'custom'] as const;
export type PaymentTermType = (typeof PAYMENT_TERM_TYPES)[number];

// ── Bill Line Schema ──────────────────────────────────────────────
export const billLineSchema = z.object({
  description: z.string().min(1).max(500),
  lineType: z.enum(BILL_LINE_TYPES),
  glAccountId: z.string().min(1),
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Amount must be a valid decimal'),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/).optional().default('1'),
  unitCost: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional(),
  locationId: z.string().optional(),
  departmentId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  receivingReceiptId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  memo: z.string().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export type BillLineInput = z.input<typeof billLineSchema>;

// ── Create Bill Schema ────────────────────────────────────────────
export const createBillSchema = z.object({
  vendorId: z.string().min(1),
  billNumber: z.string().min(1).max(50),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  paymentTermsId: z.string().optional(),
  locationId: z.string().optional(),
  memo: z.string().max(1000).optional(),
  vendorInvoiceNumber: z.string().max(100).optional(),
  lines: z.array(billLineSchema).min(1),
  clientRequestId: z.string().optional(),
});

export type CreateBillInput = z.input<typeof createBillSchema>;

// ── Update Bill Schema ────────────────────────────────────────────
export const updateBillSchema = z.object({
  billNumber: z.string().min(1).max(50).optional(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTermsId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  memo: z.string().max(1000).nullable().optional(),
  vendorInvoiceNumber: z.string().max(100).nullable().optional(),
  lines: z.array(billLineSchema).min(1).optional(),
  expectedVersion: z.number().int().optional(),
});

export type UpdateBillInput = z.input<typeof updateBillSchema>;

// ── Post Bill Schema ──────────────────────────────────────────────
export const postBillSchema = z.object({
  billId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  forcePost: z.boolean().optional().default(false),
  clientRequestId: z.string().optional(),
});

export type PostBillInput = z.input<typeof postBillSchema>;

// ── Void Bill Schema ──────────────────────────────────────────────
export const voidBillSchema = z.object({
  billId: z.string().min(1),
  reason: z.string().min(1).max(500),
  clientRequestId: z.string().optional(),
});

export type VoidBillInput = z.input<typeof voidBillSchema>;

// ── Payment Allocation Schema ─────────────────────────────────────
export const paymentAllocationSchema = z.object({
  billId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Amount must be a positive decimal'),
});

export type PaymentAllocationInput = z.input<typeof paymentAllocationSchema>;

// ── Create Payment Schema ─────────────────────────────────────────
export const createPaymentSchema = z.object({
  vendorId: z.string().min(1),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  paymentMethod: z.enum(AP_PAYMENT_METHODS),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Amount must be a positive decimal'),
  referenceNumber: z.string().max(100).optional(),
  bankAccountId: z.string().optional(),
  memo: z.string().max(1000).optional(),
  allocations: z.array(paymentAllocationSchema).min(1),
  clientRequestId: z.string().optional(),
});

export type CreatePaymentInput = z.input<typeof createPaymentSchema>;

// ── Create Payment Terms Schema ───────────────────────────────────
export const createPaymentTermsSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  termType: z.enum(PAYMENT_TERM_TYPES),
  netDays: z.number().int().min(0).max(365).optional(),
  discountDays: z.number().int().min(0).max(365).optional(),
  discountPercent: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional().default(true),
});

export type CreatePaymentTermsInput = z.input<typeof createPaymentTermsSchema>;

// ── Update Payment Terms Schema ───────────────────────────────────
export const updatePaymentTermsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
  termType: z.enum(PAYMENT_TERM_TYPES).optional(),
  netDays: z.number().int().min(0).max(365).optional(),
  discountDays: z.number().int().min(0).max(365).optional(),
  discountPercent: z.string().regex(/^\d+(\.\d{1,4})?$/).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePaymentTermsInput = z.input<typeof updatePaymentTermsSchema>;

// ── Update Vendor Accounting Schema ───────────────────────────────
export const updateVendorAccountingSchema = z.object({
  vendorNumber: z.string().max(50).nullable().optional(),
  defaultExpenseAccountId: z.string().nullable().optional(),
  defaultAPAccountId: z.string().nullable().optional(),
  paymentTermsId: z.string().nullable().optional(),
  is1099Eligible: z.boolean().optional(),
});

export type UpdateVendorAccountingInput = z.input<typeof updateVendorAccountingSchema>;
