import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ═══════════════════════════════════════════════════════════════════
// Guest Pay — Pay at the Table via QR Code
// ═══════════════════════════════════════════════════════════════════

// ── Guest Pay Sessions ───────────────────────────────────────────
// Core session per "Print Check" action. Links a tab to a guest-facing
// payment page via a secure, unguessable token.

export const guestPaySessions = pgTable(
  'guest_pay_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    tabId: text('tab_id').notNull(),
    orderId: text('order_id'),
    serverUserId: text('server_user_id'),

    // Token: base64url 32 bytes (256-bit entropy), used in guest URL
    token: text('token').notNull(),

    // Lookup code: 6-char alphanumeric for manual entry (e.g., "A3F7K2")
    lookupCode: text('lookup_code'),

    // Status lifecycle: active → paid | expired | invalidated | superseded
    status: text('status').notNull().default('active'),

    // Snapshot of check totals at print time
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    serviceChargeCents: integer('service_charge_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),

    // Tip fields (null until guest selects)
    tipCents: integer('tip_cents'),
    tipPercentage: numeric('tip_percentage', { precision: 5, scale: 2 }),
    tipBaseCents: integer('tip_base_cents'),
    tipSettingsSnapshot: jsonb('tip_settings_snapshot'),

    // Display info for guest page
    tableNumber: text('table_number'),
    partySize: integer('party_size'),
    restaurantName: text('restaurant_name'),

    // Member linkage (Path A: tab linked to member at POS)
    memberId: text('member_id'), // customer ID if tab was linked to a member
    memberDisplayName: text('member_display_name'), // snapshot
    billingAccountId: text('billing_account_id'), // linked billing/house account

    // Lifecycle
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    receiptEmailedAt: timestamp('receipt_emailed_at', { withTimezone: true }),
    supersededById: text('superseded_by_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_guest_pay_sessions_token').on(table.token),
    index('idx_guest_pay_sessions_tenant_tab_status').on(
      table.tenantId,
      table.tabId,
      table.status,
    ),
    index('idx_guest_pay_sessions_status_expires').on(
      table.status,
      table.expiresAt,
    ),
  ],
);

// ── Guest Pay Payment Attempts ───────────────────────────────────
// Payment attempt log. V1: all attempts are simulated.

export const guestPayPaymentAttempts = pgTable(
  'guest_pay_payment_attempts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => guestPaySessions.id),
    amountCents: integer('amount_cents').notNull(),
    tipCents: integer('tip_cents').notNull().default(0),

    // Status: pending | succeeded | failed | simulated
    status: text('status').notNull().default('pending'),
    // V1 = 'simulated', V2 = 'stripe' | 'square' | 'member_charge' etc.
    paymentMethod: text('payment_method').notNull().default('simulated'),
    errorMessage: text('error_message'),

    // Member charge fields (null for non-member payments)
    memberId: text('member_id'),
    billingAccountId: text('billing_account_id'),
    memberDisplayName: text('member_display_name'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_guest_pay_attempts_tenant_session').on(
      table.tenantId,
      table.sessionId,
    ),
  ],
);

// ── Guest Pay Tip Settings ───────────────────────────────────────
// Per-location tip config for the guest-facing screen.
// Separate from POS-side fnb_payment tip settings (different audience).

export const guestPayTipSettings = pgTable(
  'guest_pay_tip_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),

    isActive: boolean('is_active').notNull().default(true),
    // 'percentage' | 'amount'
    tipType: text('tip_type').notNull().default('percentage'),
    // Array of numbers e.g. [15, 20, 25] for percentage or [200, 500, 1000] for amount (cents)
    tipPresets: jsonb('tip_presets').notNull().$type<number[]>().default([15, 20, 25]),
    allowCustomTip: boolean('allow_custom_tip').notNull().default(true),
    allowNoTip: boolean('allow_no_tip').notNull().default(true),
    // 0-indexed into tipPresets
    defaultTipIndex: integer('default_tip_index'),

    // 'subtotal_pre_tax' | 'total_with_tax'
    tipCalculationBase: text('tip_calculation_base').notNull().default('subtotal_pre_tax'),
    // 'none' | 'nearest_cent' | 'nearest_5_cents'
    roundingMode: text('rounding_mode').notNull().default('nearest_cent'),
    maxTipPercent: integer('max_tip_percent').notNull().default(100),
    maxTipAmountCents: integer('max_tip_amount_cents').notNull().default(100_000),

    // Session expiry in minutes (default 60)
    sessionExpiryMinutes: integer('session_expiry_minutes').notNull().default(60),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_guest_pay_tip_settings_tenant_location').on(
      table.tenantId,
      table.locationId,
    ),
  ],
);

// ── Guest Pay Member Verifications ────────────────────────────────
// Email 2FA for Path B: self-service member authentication.
// Stores hashed 6-digit codes with expiry + attempt limits.

export const guestPayMemberVerifications = pgTable(
  'guest_pay_member_verifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => guestPaySessions.id),
    customerId: text('customer_id').notNull(),
    billingAccountId: text('billing_account_id').notNull(),
    memberDisplayName: text('member_display_name').notNull(),

    // SHA-256 hash of the 6-digit code
    codeHash: text('code_hash').notNull(),
    emailSentTo: text('email_sent_to').notNull(),

    // Status: pending | verified | expired | failed
    status: text('status').notNull().default('pending'),
    attemptsRemaining: integer('attempts_remaining').notNull().default(3),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_guest_pay_verifications_tenant_session_status').on(
      table.tenantId,
      table.sessionId,
      table.status,
    ),
  ],
);

// ── Guest Pay Audit Log (append-only) ────────────────────────────
// Captures all lifecycle events for compliance and debugging.

export const guestPayAuditLog = pgTable(
  'guest_pay_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => guestPaySessions.id),

    // Actions: session_created | tip_selected | payment_attempted | payment_simulated |
    //          session_invalidated | session_superseded | session_expired | link_copied | qr_scanned
    action: text('action').notNull(),
    // 'staff' | 'guest' | 'system'
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_guest_pay_audit_tenant_session').on(
      table.tenantId,
      table.sessionId,
    ),
  ],
);
