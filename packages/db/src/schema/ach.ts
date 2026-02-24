import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { paymentIntents } from './payment-gateway';
import { customerPaymentMethods } from './customers';

// ── ACH Returns (append-only — never UPDATE/DELETE) ─────────────
// Tracks ACH return events received from the bank/processor.
export const achReturns = pgTable(
  'ach_returns',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    paymentIntentId: text('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    returnCode: text('return_code').notNull(), // R01, R02, etc.
    returnReason: text('return_reason').notNull(),
    returnDate: text('return_date').notNull(), // YYYY-MM-DD
    originalAmountCents: integer('original_amount_cents').notNull(),
    providerRef: text('provider_ref'),
    fundingBatchId: text('funding_batch_id'),
    isAdministrative: boolean('is_administrative').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ach_returns_tenant').on(table.tenantId),
    index('idx_ach_returns_tenant_intent').on(table.tenantId, table.paymentIntentId),
    index('idx_ach_returns_tenant_date').on(table.tenantId, table.returnDate),
    index('idx_ach_returns_tenant_code').on(table.tenantId, table.returnCode),
  ],
);

// ── ACH Micro-Deposit Verification ──────────────────────────────
// Tracks micro-deposit verification flows for bank account ownership proof.
export const achMicroDeposits = pgTable(
  'ach_micro_deposits',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    paymentMethodId: text('payment_method_id')
      .notNull()
      .references(() => customerPaymentMethods.id),
    amount1Cents: integer('amount1_cents').notNull(), // 1-99 cents
    amount2Cents: integer('amount2_cents').notNull(), // 1-99 cents
    status: text('status').notNull().default('pending'),
    // 'pending' | 'deposited' | 'verified' | 'failed' | 'expired'
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    depositIntentId1: text('deposit_intent_id1'), // payment intent for first micro-deposit
    depositIntentId2: text('deposit_intent_id2'), // payment intent for second micro-deposit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ach_micro_deposits_tenant').on(table.tenantId),
    index('idx_ach_micro_deposits_method').on(table.paymentMethodId),
  ],
);
