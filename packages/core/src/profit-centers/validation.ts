import { z } from 'zod';

// ── Profit Center (terminal_locations) ──────────────────────────

export const createProfitCenterSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  tipsApplicable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  allowSiteLevel: z.boolean().optional(),
});

export type CreateProfitCenterInput = z.input<typeof createProfitCenterSchema>;

export const updateProfitCenterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).nullish(),
  description: z.string().max(500).nullish(),
  icon: z.string().max(50).nullish(),
  tipsApplicable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateProfitCenterInput = z.input<typeof updateProfitCenterSchema>;

// ── Terminal ────────────────────────────────────────────────────

export const createTerminalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  terminalNumber: z.number().int().positive().optional(),
  deviceIdentifier: z.string().max(100).optional(),
  ipAddress: z.string().max(45).optional(),
  isActive: z.boolean().default(true),
});

export type CreateTerminalInput = z.input<typeof createTerminalSchema>;

export const updateTerminalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  terminalNumber: z.number().int().positive().nullish(),
  deviceIdentifier: z.string().max(100).nullish(),
  ipAddress: z.string().max(45).nullish(),
  isActive: z.boolean().optional(),
});

export type UpdateTerminalInput = z.input<typeof updateTerminalSchema>;
