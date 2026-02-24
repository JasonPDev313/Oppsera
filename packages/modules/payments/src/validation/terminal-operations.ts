import { z } from 'zod';

// ── Terminal Auth Card (card-present authorization/sale) ──────

export const terminalAuthCardSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  terminalId: z.string().min(1),
  amountCents: z.number().int().min(1),
  tipCents: z.number().int().min(0).default(0),
  capture: z.enum(['Y', 'N']).default('Y'), // Y = sale, N = auth only
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  surchargeAmountCents: z.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TerminalAuthCardInput = z.input<typeof terminalAuthCardSchema>;

// ── Terminal Read Card (read only, no auth) ──────────────────

export const terminalReadCardSchema = z.object({
  terminalId: z.string().min(1),
  amountCents: z.number().int().min(0).optional(),
});
export type TerminalReadCardInput = z.input<typeof terminalReadCardSchema>;

// ── Terminal Display ────────────────────────────────────────

export const terminalDisplaySchema = z.object({
  terminalId: z.string().min(1),
  text: z.string().min(1).max(500),
});
export type TerminalDisplayInput = z.input<typeof terminalDisplaySchema>;

// ── Terminal Cancel ─────────────────────────────────────────

export const terminalCancelSchema = z.object({
  terminalId: z.string().min(1),
});
export type TerminalCancelInput = z.input<typeof terminalCancelSchema>;

// ── Terminal Tip Prompt ─────────────────────────────────────

export const terminalTipSchema = z.object({
  terminalId: z.string().min(1),
  amountCents: z.number().int().min(1),
  tipOptions: z.array(z.string()).default(['15', '18', '20']),
});
export type TerminalTipInput = z.input<typeof terminalTipSchema>;
