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
    authorizationKey: z.string().max(200).optional(),
    achUsername: z.string().max(100).optional(),
    achPassword: z.string().max(200).optional(),
    fundingUsername: z.string().max(100).optional(),
    fundingPassword: z.string().max(200).optional(),
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
  // ── Merchant Account Settings (migration 0188) ──
  hsn: z.string().max(50).optional(),
  achMerchantId: z.string().max(50).optional(),
  fundingMerchantId: z.string().max(50).optional(),
  useForCardSwipe: z.boolean().default(true),
  readerBeep: z.boolean().default(true),
  isProduction: z.boolean().default(false),
  allowManualEntry: z.boolean().default(false),
  tipOnDevice: z.boolean().default(false),
});
export type CreateMerchantAccountInput = z.input<typeof createMerchantAccountSchema>;

export const updateMerchantAccountSchema = z.object({
  merchantAccountId: z.string().min(1),
  displayName: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  // ── Merchant Account Settings (migration 0188) ──
  hsn: z.string().max(50).nullable().optional(),
  achMerchantId: z.string().max(50).nullable().optional(),
  fundingMerchantId: z.string().max(50).nullable().optional(),
  useForCardSwipe: z.boolean().optional(),
  readerBeep: z.boolean().optional(),
  isProduction: z.boolean().optional(),
  allowManualEntry: z.boolean().optional(),
  tipOnDevice: z.boolean().optional(),
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
  surchargeAmountCents: z.number().int().min(0).default(0),
  // ── ACH-specific fields ──
  achAccountType: z.enum(['ECHK', 'ESAV']).optional(),
  achSecCode: z.enum(['CCD', 'PPD', 'TEL', 'WEB']).optional(),
  achDescription: z.string().max(100).optional(),
}).refine(
  (data) => data.paymentMethodType !== 'ach' || data.achSecCode != null,
  { message: 'achSecCode is required for ACH payments', path: ['achSecCode'] },
);
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
  surchargeAmountCents: z.number().int().min(0).default(0),
  // ── ACH-specific fields ──
  achAccountType: z.enum(['ECHK', 'ESAV']).optional(),
  achSecCode: z.enum(['CCD', 'PPD', 'TEL', 'WEB']).optional(),
  achDescription: z.string().max(100).optional(),
}).refine(
  (data) => data.paymentMethodType !== 'ach' || data.achSecCode != null,
  { message: 'achSecCode is required for ACH payments', path: ['achSecCode'] },
);
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
  clientRequestId: z.string().min(1).optional(),
});
export type InquirePaymentInput = z.input<typeof inquirePaymentSchema>;

// ── ACH Bank Account Operations ─────────────────────────────────

export const tokenizeBankAccountSchema = z.object({
  routingNumber: z.string().regex(/^\d{9}$/, 'ABA routing number must be exactly 9 digits'),
  accountNumber: z.string().regex(/^\d{4,17}$/, 'Account number must be 4-17 digits'),
  accountType: z.enum(['checking', 'savings']),
});
export type TokenizeBankAccountInput = z.input<typeof tokenizeBankAccountSchema>;

export const addBankAccountSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  customerId: z.string().min(1),
  token: z.string().min(1), // CardSecure token from tokenization
  routingLast4: z.string().length(4),
  accountLast4: z.string().length(4),
  accountType: z.enum(['checking', 'savings']),
  bankName: z.string().max(100).optional(),
  nickname: z.string().max(50).optional(),
  isDefault: z.boolean().default(false),
  skipVerification: z.boolean().default(false), // skip micro-deposit verification
});
export type AddBankAccountInput = z.input<typeof addBankAccountSchema>;

export const verifyMicroDepositsSchema = z.object({
  paymentMethodId: z.string().min(1),
  amount1Cents: z.number().int().min(1).max(99),
  amount2Cents: z.number().int().min(1).max(99),
});
export type VerifyMicroDepositsInput = z.input<typeof verifyMicroDepositsSchema>;

export const updateMerchantAccountAchSchema = z.object({
  merchantAccountId: z.string().min(1),
  achEnabled: z.boolean().optional(),
  achDefaultSecCode: z.enum(['CCD', 'PPD', 'TEL', 'WEB']).optional(),
  achCompanyName: z.string().max(100).optional(),
  achCompanyId: z.string().max(50).optional(),
  achVerificationMode: z.enum(['none', 'account_validation', 'micro_deposit']).optional(),
});
export type UpdateMerchantAccountAchInput = z.input<typeof updateMerchantAccountAchSchema>;

// ── Search / List ────────────────────────────────────────────────

export const searchTransactionsSchema = z.object({
  status: z.string().optional(),
  paymentMethodType: z.enum(['card', 'ach']).optional(),
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
