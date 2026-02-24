import { z } from 'zod';

// ── Provider Management ──────────────────────────────────────────

export const createProviderSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, 'lowercase_snake_case only'),
  displayName: z.string().min(1).max(100),
  providerType: z.enum(['gateway', 'terminal', 'both']).default('gateway'),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type CreateProviderInput = z.input<typeof createProviderSchema>;

export const updateProviderSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateProviderInput = z.input<typeof updateProviderSchema>;

// ── Credential Management ────────────────────────────────────────

export const saveCredentialsSchema = z.object({
  providerId: z.string().min(1),
  locationId: z.string().optional(), // null = tenant-wide
  credentials: z.object({
    site: z.string().min(1).max(100),
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
  }),
  isSandbox: z.boolean().default(false),
});
export type SaveCredentialsInput = z.input<typeof saveCredentialsSchema>;

// ── Merchant Account (MID) Management ────────────────────────────

export const createMerchantAccountSchema = z.object({
  providerId: z.string().min(1),
  locationId: z.string().optional(), // null = tenant-wide
  merchantId: z.string().min(1).max(50), // the provider's MID
  displayName: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type CreateMerchantAccountInput = z.input<typeof createMerchantAccountSchema>;

export const updateMerchantAccountSchema = z.object({
  merchantAccountId: z.string().min(1),
  displayName: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateMerchantAccountInput = z.input<typeof updateMerchantAccountSchema>;

// ── Terminal → MID Assignment ────────────────────────────────────

export const assignTerminalMerchantSchema = z.object({
  terminalId: z.string().min(1),
  merchantAccountId: z.string().min(1),
});
export type AssignTerminalMerchantInput = z.input<typeof assignTerminalMerchantSchema>;

// ── Payment Operations ───────────────────────────────────────────

export const authorizePaymentSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  amountCents: z.number().int().min(1),
  currency: z.string().default('USD'),
  token: z.string().min(1).optional(),
  paymentMethodId: z.string().optional(), // stored card
  expiry: z.string().regex(/^\d{4}$/, 'MMYY format').optional(),
  cvv: z.string().min(3).max(4).optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  terminalId: z.string().optional(),
  locationId: z.string().optional(),
  tipCents: z.number().int().min(0).default(0),
  paymentMethodType: z.enum(['card', 'ach', 'token', 'terminal']).default('card'),
  ecomind: z.enum(['E', 'R', 'T']).default('E'), // ecommerce, recurring, terminal
  name: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  postal: z.string().max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuthorizePaymentInput = z.input<typeof authorizePaymentSchema>;

export const capturePaymentSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  paymentIntentId: z.string().min(1),
  amountCents: z.number().int().min(1).optional(), // optional partial capture
  tipCents: z.number().int().min(0).optional(),
});
export type CapturePaymentInput = z.input<typeof capturePaymentSchema>;

export const salePaymentSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  amountCents: z.number().int().min(1),
  currency: z.string().default('USD'),
  token: z.string().min(1).optional(),
  paymentMethodId: z.string().optional(),
  expiry: z.string().regex(/^\d{4}$/, 'MMYY format').optional(),
  cvv: z.string().min(3).max(4).optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  terminalId: z.string().optional(),
  locationId: z.string().optional(),
  tipCents: z.number().int().min(0).default(0),
  paymentMethodType: z.enum(['card', 'ach', 'token', 'terminal']).default('card'),
  ecomind: z.enum(['E', 'R', 'T']).default('E'),
  name: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  postal: z.string().max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SalePaymentInput = z.input<typeof salePaymentSchema>;

export const voidPaymentSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  paymentIntentId: z.string().min(1),
});
export type VoidPaymentInput = z.input<typeof voidPaymentSchema>;

export const refundPaymentSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  paymentIntentId: z.string().min(1),
  amountCents: z.number().int().min(1).optional(), // optional partial refund
});
export type RefundPaymentInput = z.input<typeof refundPaymentSchema>;

export const tokenizeCardSchema = z.object({
  account: z.string().min(1), // card number or encrypted track
  expiry: z.string().regex(/^\d{4}$/, 'MMYY format').optional(),
});
export type TokenizeCardInput = z.input<typeof tokenizeCardSchema>;

export const createPaymentProfileSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  customerId: z.string().min(1),
  token: z.string().min(1),
  expiry: z.string().regex(/^\d{4}$/, 'MMYY format'),
  name: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  postal: z.string().max(20).optional(),
  nickname: z.string().max(50).optional(),
  isDefault: z.boolean().default(false),
});
export type CreatePaymentProfileInput = z.input<typeof createPaymentProfileSchema>;

export const inquirePaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
});
export type InquirePaymentInput = z.input<typeof inquirePaymentSchema>;

// ── Search / List ────────────────────────────────────────────────

export const searchTransactionsSchema = z.object({
  status: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  amountMinCents: z.number().int().optional(),
  amountMaxCents: z.number().int().optional(),
  cardLast4: z.string().length(4).optional(),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
  locationId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export type SearchTransactionsInput = z.input<typeof searchTransactionsSchema>;
