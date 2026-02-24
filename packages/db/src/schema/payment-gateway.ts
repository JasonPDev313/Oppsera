import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { terminals } from './terminals';

// ── Payment Providers (catalog of available gateway providers) ───
export const paymentProviders = pgTable(
  'payment_providers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(), // 'cardpointe', 'square', 'worldpay', etc.
    displayName: text('display_name').notNull(),
    providerType: text('provider_type').notNull().default('gateway'), // 'gateway', 'terminal', 'both'
    isActive: boolean('is_active').notNull().default(true),
    config: jsonb('config'), // non-sensitive settings (sandbox mode, feature flags)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_providers_tenant').on(table.tenantId),
    uniqueIndex('uq_payment_providers_tenant_code').on(table.tenantId, table.code),
  ],
);

// ── Payment Provider Credentials (encrypted API keys per tenant) ─
export const paymentProviderCredentials = pgTable(
  'payment_provider_credentials',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => paymentProviders.id),
    locationId: text('location_id').references(() => locations.id), // null = tenant-wide default
    credentialsEncrypted: text('credentials_encrypted').notNull(), // AES-256-GCM encrypted JSON
    isSandbox: boolean('is_sandbox').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_creds_tenant').on(table.tenantId),
    uniqueIndex('uq_payment_creds_tenant_provider_location').on(
      table.tenantId,
      table.providerId,
      table.locationId,
    ),
  ],
);

// ── Payment Merchant Accounts (MIDs — multiple per location) ─────
// A location/course can have multiple MIDs. Each MID is assigned to terminals.
export const paymentMerchantAccounts = pgTable(
  'payment_merchant_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => paymentProviders.id),
    locationId: text('location_id').references(() => locations.id), // null = tenant-wide
    merchantId: text('merchant_id').notNull(), // the provider's merchant ID (MID)
    displayName: text('display_name').notNull(), // friendly name: "Pro Shop MID", "Restaurant MID"
    isDefault: boolean('is_default').notNull().default(false), // default MID for this location
    isActive: boolean('is_active').notNull().default(true),
    config: jsonb('config'), // MID-specific settings (settlement time, etc.)
    // ── ACH-specific MID settings (migration 0178) ──
    achEnabled: boolean('ach_enabled').notNull().default(false),
    achDefaultSecCode: text('ach_default_sec_code').default('WEB'), // 'CCD' | 'PPD' | 'TEL' | 'WEB'
    achCompanyName: text('ach_company_name'), // NACHA required — appears on bank statements
    achCompanyId: text('ach_company_id'), // originator identification
    achVerificationMode: text('ach_verification_mode').notNull().default('account_validation'),
    // 'none' | 'account_validation' | 'micro_deposit'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_merchant_accts_tenant').on(table.tenantId),
    index('idx_payment_merchant_accts_tenant_location').on(table.tenantId, table.locationId),
    uniqueIndex('uq_payment_merchant_accts_tenant_provider_mid').on(
      table.tenantId,
      table.providerId,
      table.merchantId,
    ),
  ],
);

// ── Terminal Merchant Assignments (terminal → MID linkage) ───────
// Each terminal can be assigned to a specific MID. Terminal 1 may use a different MID than Terminal 2.
export const terminalMerchantAssignments = pgTable(
  'terminal_merchant_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    merchantAccountId: text('merchant_account_id')
      .notNull()
      .references(() => paymentMerchantAccounts.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_merchant_tenant').on(table.tenantId),
    uniqueIndex('uq_terminal_merchant_tenant_terminal').on(table.tenantId, table.terminalId),
  ],
);

// ── Payment Intents (authorization lifecycle state machine) ──────
export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => paymentProviders.id),
    merchantAccountId: text('merchant_account_id')
      .notNull()
      .references(() => paymentMerchantAccounts.id),
    status: text('status').notNull().default('created'),
    // Status values: 'created', 'authorized', 'capture_pending', 'captured',
    //   'voided', 'refund_pending', 'refunded', 'declined', 'error', 'resolved'
    amountCents: integer('amount_cents').notNull(), // requested amount
    currency: text('currency').notNull().default('USD'),
    authorizedAmountCents: integer('authorized_amount_cents'),
    capturedAmountCents: integer('captured_amount_cents'),
    refundedAmountCents: integer('refunded_amount_cents'),
    customerId: text('customer_id'), // optional FK (enforced at app level)
    orderId: text('order_id'), // our internal order ID
    providerOrderId: text('provider_order_id'), // sent to provider for idempotent lookups
    paymentMethodType: text('payment_method_type').notNull(), // 'card', 'ach', 'token', 'terminal'
    token: text('token'), // CardSecure token or stored token
    cardLast4: text('card_last4'),
    cardBrand: text('card_brand'),
    tenderId: text('tender_id'), // link back to tenders table after recording
    metadata: jsonb('metadata'), // arbitrary caller context
    idempotencyKey: text('idempotency_key').notNull(),
    errorMessage: text('error_message'),
    // ── Surcharge (migration 0182) ──
    surchargeAmountCents: integer('surcharge_amount_cents').default(0),
    // ── ACH-specific fields (migration 0178) ──
    achAccountType: text('ach_account_type'), // 'ECHK' (checking) | 'ESAV' (savings)
    achSecCode: text('ach_sec_code'), // 'CCD' | 'PPD' | 'TEL' | 'WEB'
    achSettlementStatus: text('ach_settlement_status'), // 'pending' | 'originated' | 'settled' | 'returned'
    achSettledAt: timestamp('ach_settled_at', { withTimezone: true }),
    achReturnCode: text('ach_return_code'), // R01, R02, etc.
    achReturnReason: text('ach_return_reason'),
    bankLast4: text('bank_last4'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_payment_intents_tenant_status').on(table.tenantId, table.status),
    index('idx_payment_intents_tenant_order').on(table.tenantId, table.orderId),
    index('idx_payment_intents_tenant_provider_order').on(
      table.tenantId,
      table.providerOrderId,
    ),
    index('idx_payment_intents_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_payment_intents_tenant_idempotency').on(
      table.tenantId,
      table.idempotencyKey,
    ),
  ],
);

// ── Payment Transactions (individual provider API call records) ──
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    paymentIntentId: text('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    transactionType: text('transaction_type').notNull(),
    // 'authorization', 'capture', 'void', 'refund', 'inquiry', 'sale'
    providerRef: text('provider_ref'), // CardPointe retref
    authCode: text('auth_code'),
    amountCents: integer('amount_cents').notNull(),
    responseStatus: text('response_status').notNull(), // 'approved', 'declined', 'retry', 'error'
    responseCode: text('response_code'), // CardPointe respcode
    responseText: text('response_text'), // CardPointe resptext
    avsResponse: text('avs_response'),
    cvvResponse: text('cvv_response'),
    providerResponse: jsonb('provider_response'), // full raw response
    clientRequestId: text('client_request_id'), // idempotency key per operation (enables void/refund dedup)
    // ── Surcharge (migration 0182) ──
    surchargeAmountCents: integer('surcharge_amount_cents').default(0),
    // ── Response enrichment (migration 0180) ──
    declineCategory: text('decline_category'), // hard/soft/data_fix/config_error/fraud/network_error
    userMessage: text('user_message'), // cardholder-safe message
    suggestedAction: text('suggested_action'), // try_different_card/retry_later/etc.
    retryable: boolean('retryable'), // whether this failure is retryable
    avsResult: text('avs_result'), // pass/partial/fail/unavailable (interpreted)
    cvvResult: text('cvv_result'), // pass/fail/unavailable (interpreted)
    visaDeclineCategory: integer('visa_decline_category'), // 1=never, 2=retry, 3=fix data
    mcAdviceCode: text('mc_advice_code'), // Mastercard merchant advice code
    processor: text('processor'), // respproc value from gateway
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_txn_tenant_ref').on(table.tenantId, table.providerRef),
    index('idx_payment_txn_intent').on(table.paymentIntentId),
  ],
);

// ── Payment Webhook Events (deduplication) ───────────────────────
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerCode: text('provider_code').notNull(),
    eventType: text('event_type').notNull(),
    eventId: text('event_id').notNull(), // provider's event identifier
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_webhooks_tenant').on(table.tenantId),
    uniqueIndex('uq_payment_webhooks_tenant_provider_event').on(
      table.tenantId,
      table.providerCode,
      table.eventId,
    ),
  ],
);
