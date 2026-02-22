import { z } from 'zod';

// ── Open Drawer Session ─────────────────────────────────────────

export const openDrawerSessionSchema = z.object({
  terminalId: z.string().min(1, 'Terminal is required'),
  locationId: z.string().min(1, 'Location is required'),
  profitCenterId: z.string().optional(),
  openingBalanceCents: z.number().int().min(0).default(0),
  changeFundCents: z.number().int().min(0).default(0),
  businessDate: z.string().date().optional(), // defaults to today
});

export type OpenDrawerSessionInput = z.input<typeof openDrawerSessionSchema>;

// ── Close Drawer Session ────────────────────────────────────────

export const closeDrawerSessionSchema = z.object({
  drawerSessionId: z.string().min(1, 'Drawer session is required'),
  closingCountCents: z.number().int().min(0),
  notes: z.string().max(1000).optional(),
});

export type CloseDrawerSessionInput = z.input<typeof closeDrawerSessionSchema>;

// ── Record Drawer Event ─────────────────────────────────────────

export const recordDrawerEventSchema = z.object({
  drawerSessionId: z.string().min(1, 'Drawer session is required'),
  eventType: z.enum(['paid_in', 'paid_out', 'cash_drop', 'drawer_open', 'no_sale']),
  amountCents: z.number().int().min(0).default(0),
  reason: z.string().max(500).optional(),
  approvedBy: z.string().optional(),
  // Cash drop enhancements (ACCT-CLOSE-01)
  bagId: z.string().max(100).optional(),
  sealNumber: z.string().max(100).optional(),
});

export type RecordDrawerEventInput = z.input<typeof recordDrawerEventSchema>;

// ── Verify Cash Drop ────────────────────────────────────────────

export const verifyCashDropSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
});

export type VerifyCashDropInput = z.input<typeof verifyCashDropSchema>;

// ── Prepare Deposit Slip ────────────────────────────────────────

export const denominationBreakdownSchema = z.object({
  hundreds: z.number().int().min(0).default(0),
  fifties: z.number().int().min(0).default(0),
  twenties: z.number().int().min(0).default(0),
  tens: z.number().int().min(0).default(0),
  fives: z.number().int().min(0).default(0),
  ones: z.number().int().min(0).default(0),
  quarters: z.number().int().min(0).default(0),
  dimes: z.number().int().min(0).default(0),
  nickels: z.number().int().min(0).default(0),
  pennies: z.number().int().min(0).default(0),
});

export const prepareDepositSlipSchema = z.object({
  depositSlipId: z.string().min(1, 'Deposit slip is required'),
  denominationBreakdown: denominationBreakdownSchema,
  slipNumber: z.string().max(50).optional(),
  totalAmountCents: z.number().int().min(0),
});

export type PrepareDepositSlipInput = z.input<typeof prepareDepositSlipSchema>;
