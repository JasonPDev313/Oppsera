import { z } from 'zod';

// ── Create ───────────────────────────────────────────────────────

export const createRegisterTabSchema = z.object({
  terminalId: z.string().min(1),
  tabNumber: z.number().int().min(1),
  label: z.string().max(50).optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().max(100).optional(),
  locationId: z.string().optional(),
  deviceId: z.string().optional(),
});

export type CreateRegisterTabInput = z.input<typeof createRegisterTabSchema>;

// ── Update ───────────────────────────────────────────────────────

export const updateRegisterTabSchema = z.object({
  tabId: z.string().min(1),
  expectedVersion: z.number().int().min(1).optional(),
  orderId: z.string().nullable().optional(),
  label: z.string().max(50).nullable().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().max(100).optional(),
  deviceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  folioId: z.string().nullable().optional(),
  guestName: z.string().max(100).nullable().optional(),
});

export type UpdateRegisterTabInput = z.input<typeof updateRegisterTabSchema>;

// ── Close ────────────────────────────────────────────────────────

export const closeRegisterTabSchema = z.object({
  tabId: z.string().min(1),
  expectedVersion: z.number().int().min(1).optional(),
});

export type CloseRegisterTabInput = z.input<typeof closeRegisterTabSchema>;

// ── Transfer ─────────────────────────────────────────────────────

export const transferRegisterTabSchema = z.object({
  sourceTabId: z.string().min(1),
  targetTerminalId: z.string().min(1),
  targetTabNumber: z.number().int().min(1),
  expectedVersion: z.number().int().min(1).optional(),
});

export type TransferRegisterTabInput = z.input<typeof transferRegisterTabSchema>;
