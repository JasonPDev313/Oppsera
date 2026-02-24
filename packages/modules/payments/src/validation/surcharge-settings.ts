import { z } from 'zod';

// ── Save / Update surcharge settings ─────────────────────────────
export const saveSurchargeSettingsSchema = z.object({
  providerId: z.string().min(1),
  locationId: z.string().nullable().optional(),
  terminalId: z.string().nullable().optional(),
  isEnabled: z.boolean(),
  surchargeRate: z.number().min(0).max(0.1), // 0-10%
  maxSurchargeRate: z.number().min(0).max(0.1).default(0.04), // 4% default cap
  applyToCreditOnly: z.boolean().default(true),
  exemptDebit: z.boolean().default(true),
  exemptPrepaid: z.boolean().default(true),
  customerDisclosureText: z.string().max(500).optional(),
  receiptDisclosureText: z.string().max(200).optional(),
  prohibitedStates: z.array(z.string().length(2)).optional(),
  glAccountId: z.string().nullable().optional(),
});

export type SaveSurchargeSettingsInput = z.input<typeof saveSurchargeSettingsSchema>;

// ── Delete surcharge settings ────────────────────────────────────
export const deleteSurchargeSettingsSchema = z.object({
  id: z.string().min(1),
});

export type DeleteSurchargeSettingsInput = z.input<typeof deleteSurchargeSettingsSchema>;

// ── Surcharge calculation input (runtime) ────────────────────────
export const surchargeCalculationSchema = z.object({
  amountCents: z.number().int().min(0),
  binType: z.enum(['credit', 'debit', 'prepaid', 'unknown']).optional(),
  customerState: z.string().length(2).optional(),
});

export type SurchargeCalculationInput = z.input<typeof surchargeCalculationSchema>;
