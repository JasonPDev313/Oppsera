import { z } from 'zod';

// ── Vendor CRUD ──────────────────────────────────────────────────

export const vendorSchema = z.object({
  name: z.string().trim().min(1, 'Vendor name is required').max(200),
  accountNumber: z.string().max(50).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email('Invalid email format').max(254).optional().nullable(),
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
  website: z.string().url('Invalid URL format').max(500).optional().nullable(),
  defaultPaymentTerms: z.string().max(50).optional().nullable(),
});
export type VendorInput = z.input<typeof vendorSchema>;

export const updateVendorManagementSchema = z.object({
  vendorId: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
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
  website: z.string().url().max(500).optional().nullable(),
  defaultPaymentTerms: z.string().max(50).optional().nullable(),
});
export type UpdateVendorManagementInput = z.input<typeof updateVendorManagementSchema>;

// ── Vendor Catalog (Item-Vendor Mappings) ────────────────────────

export const addVendorCatalogItemSchema = z.object({
  vendorId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  vendorSku: z.string().max(100).optional().nullable(),
  vendorCost: z.number().nonnegative().optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().optional().nullable(),
  isPreferred: z.boolean().default(false),
  minOrderQty: z.number().positive().optional().nullable(),
  packSize: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type AddVendorCatalogItemInput = z.input<typeof addVendorCatalogItemSchema>;

export const updateVendorCatalogItemSchema = z.object({
  itemVendorId: z.string().min(1),
  vendorSku: z.string().max(100).optional().nullable(),
  vendorCost: z.number().nonnegative().optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().optional().nullable(),
  isPreferred: z.boolean().optional(),
  minOrderQty: z.number().positive().optional().nullable(),
  packSize: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateVendorCatalogItemInput = z.input<typeof updateVendorCatalogItemSchema>;

// ── Vendor List Filters ──────────────────────────────────────────

export const vendorListFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().default(true),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  sortBy: z.enum(['name', 'last_receipt_date', 'item_count']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type VendorListFilterInput = z.input<typeof vendorListFilterSchema>;
