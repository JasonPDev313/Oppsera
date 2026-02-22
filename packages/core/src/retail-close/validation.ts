import { z } from 'zod';

export const startRetailCloseSchema = z.object({
  terminalId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().optional(), // defaults to today
  drawerSessionId: z.string().optional(),
});
export type StartRetailCloseInput = z.input<typeof startRetailCloseSchema>;

export const reconcileRetailCloseSchema = z.object({
  batchId: z.string().min(1),
  cashCountedCents: z.number().int().min(0),
  notes: z.string().optional(),
});
export type ReconcileRetailCloseInput = z.input<typeof reconcileRetailCloseSchema>;

export const postRetailCloseSchema = z.object({
  batchId: z.string().min(1),
});
export type PostRetailCloseInput = z.input<typeof postRetailCloseSchema>;

export const lockRetailCloseSchema = z.object({
  batchId: z.string().min(1),
});
export type LockRetailCloseInput = z.input<typeof lockRetailCloseSchema>;
