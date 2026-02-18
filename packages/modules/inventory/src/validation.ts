import { z } from 'zod';

const idempotencyMixin = {
  clientRequestId: z.string().min(1).max(128).optional(),
};

// receiveInventory -- stock received from supplier/transfer
export const receiveInventorySchema = z.object({
  ...idempotencyMixin,
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(), // supports fractional (F&B)
  unitCost: z.number().nonnegative().optional(), // dollars, as number
  reason: z.string().max(500).optional(),
  referenceType: z.enum(['purchase_order', 'transfer', 'manual']).default('manual'),
  referenceId: z.string().optional(),
  businessDate: z.string().date(),
  employeeId: z.string().min(1).optional(),
  terminalId: z.string().optional(),
});
export type ReceiveInventoryInput = z.input<typeof receiveInventorySchema>;

// adjustInventory -- manual count correction (+/-)
export const adjustInventorySchema = z.object({
  ...idempotencyMixin,
  inventoryItemId: z.string().min(1),
  quantityDelta: z.number(), // can be negative (allows adjustment down)
  reason: z.string().min(1).max(500), // reason REQUIRED for adjustments
  unitCost: z.number().nonnegative().optional(),
  businessDate: z.string().date(),
  employeeId: z.string().min(1).optional(),
  terminalId: z.string().optional(),
});
export type AdjustInventoryInput = z.input<typeof adjustInventorySchema>;

// transferInventory -- move stock between locations
export const transferInventorySchema = z.object({
  ...idempotencyMixin,
  catalogItemId: z.string().min(1), // use catalog item to find inventory at both locations
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().max(500).optional(),
  unitCost: z.number().nonnegative().optional(),
  businessDate: z.string().date(),
  employeeId: z.string().min(1).optional(),
});
export type TransferInventoryInput = z.input<typeof transferInventorySchema>;

// recordShrink -- loss/waste/theft/damage
export const recordShrinkSchema = z.object({
  ...idempotencyMixin,
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(), // always positive, stored as negative delta
  shrinkType: z.enum(['waste', 'theft', 'damage', 'expiry', 'other']),
  reason: z.string().min(1).max(500), // reason REQUIRED
  unitCost: z.number().nonnegative().optional(),
  businessDate: z.string().date(),
  employeeId: z.string().min(1).optional(),
  terminalId: z.string().optional(),
});
export type RecordShrinkInput = z.input<typeof recordShrinkSchema>;

// archiveInventoryItem -- archive/unarchive an inventory item
export const archiveInventoryItemSchema = z.object({
  inventoryItemId: z.string().min(1),
  archive: z.boolean(), // true = archive, false = unarchive
});
export type ArchiveInventoryItemInput = z.input<typeof archiveInventoryItemSchema>;
