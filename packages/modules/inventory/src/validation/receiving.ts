import { z } from 'zod';

// ── Receipt Header ──────────────────────────────────────────────

export const createReceiptSchema = z.object({
  vendorId: z.string().min(1),
  locationId: z.string().min(1),
  receivedDate: z.string().date(),
  vendorInvoiceNumber: z.string().max(100).optional(),
  shippingCost: z.number().nonnegative().default(0),
  shippingAllocationMethod: z
    .enum(['by_cost', 'by_qty', 'by_weight', 'none'])
    .default('none'),
  taxAmount: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional(),
});
export type CreateReceiptInput = z.input<typeof createReceiptSchema>;

export const updateReceiptSchema = z.object({
  receiptId: z.string().min(1),
  vendorId: z.string().min(1).optional(),
  vendorInvoiceNumber: z.string().max(100).optional().nullable(),
  receivedDate: z.string().date().optional(),
  shippingCost: z.number().nonnegative().optional(),
  shippingAllocationMethod: z
    .enum(['by_cost', 'by_qty', 'by_weight', 'none'])
    .optional(),
  taxAmount: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UpdateReceiptInput = z.input<typeof updateReceiptSchema>;

// ── Receipt Lines ───────────────────────────────────────────────

export const addReceiptLineSchema = z.object({
  receiptId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  quantityReceived: z.number().positive(),
  uomCode: z.string().min(1).max(20),
  unitCost: z.number().nonnegative(),
  weight: z.number().nonnegative().optional().nullable(),
  lotNumber: z.string().max(100).optional(),
  serialNumbers: z.array(z.string()).optional(),
  expirationDate: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
  purchaseOrderId: z.string().optional(),
  purchaseOrderLineId: z.string().optional(),
});
export type AddReceiptLineInput = z.input<typeof addReceiptLineSchema>;

export const updateReceiptLineSchema = z.object({
  lineId: z.string().min(1),
  quantityReceived: z.number().positive().optional(),
  uomCode: z.string().min(1).max(20).optional(),
  unitCost: z.number().nonnegative().optional(),
  weight: z.number().nonnegative().optional().nullable(),
  lotNumber: z.string().max(100).optional().nullable(),
  serialNumbers: z.array(z.string()).optional().nullable(),
  expirationDate: z.string().date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateReceiptLineInput = z.input<typeof updateReceiptLineSchema>;

// ── Posting / Voiding ───────────────────────────────────────────

export const postReceiptSchema = z.object({
  receiptId: z.string().min(1),
});
export type PostReceiptInput = z.input<typeof postReceiptSchema>;

export const voidReceiptSchema = z.object({
  receiptId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
export type VoidReceiptInput = z.input<typeof voidReceiptSchema>;

// ── Vendor CRUD ─────────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  accountNumber: z.string().max(50).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(254).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  paymentTerms: z.string().max(50).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type CreateVendorInput = z.input<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  vendorId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  accountNumber: z.string().max(50).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(254).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  paymentTerms: z.string().max(50).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateVendorInput = z.input<typeof updateVendorSchema>;
