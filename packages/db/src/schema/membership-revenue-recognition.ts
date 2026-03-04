import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── membership_dues_recognition_schedule ─────────────────────────
// Tracks each billing charge's recognition state (ASC 606 straight-line).
// One row is inserted per billing charge by the membership-posting-adapter.
// The daily recognition cron reads active rows and posts incremental GL entries.
export const membershipDuesRecognitionSchedule = pgTable(
  'membership_dues_recognition_schedule',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subscriptionId: text('subscription_id').notNull(), // FK to membership_subscriptions.id
    billingSourceRef: text('billing_source_ref').notNull(), // e.g. 'billing-{membershipId}-{periodStart}'
    revenueGlAccountId: text('revenue_gl_account_id').notNull(),
    deferredRevenueGlAccountId: text('deferred_revenue_gl_account_id').notNull(),
    customerId: text('customer_id'),
    locationId: text('location_id'),
    billingPeriodStart: date('billing_period_start').notNull(),
    billingPeriodEnd: date('billing_period_end').notNull(), // exclusive — first day of next period
    totalAmountCents: integer('total_amount_cents').notNull(),
    recognizedAmountCents: integer('recognized_amount_cents').notNull().default(0),
    status: text('status').notNull().default('active'), // active, fully_recognized
    lastRecognizedDate: date('last_recognized_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_mdrs_tenant_billing_ref').on(table.tenantId, table.billingSourceRef),
    index('idx_mdrs_tenant_status').on(table.tenantId, table.status),
    index('idx_mdrs_tenant_period').on(table.tenantId, table.billingPeriodEnd),
    index('idx_mdrs_tenant_subscription').on(table.tenantId, table.subscriptionId),
    check('chk_mdrs_status', sql`status IN ('active', 'fully_recognized')`),
    check('chk_mdrs_total_cents', sql`total_amount_cents >= 0`),
    check('chk_mdrs_recognized_cents', sql`recognized_amount_cents >= 0`),
  ],
);

// ── membership_dues_recognition_entries ──────────────────────────
// Append-only ledger: one row per recognition posting per schedule row.
// Idempotency enforced via unique(tenantId, scheduleId, recognitionDate).
export const membershipDuesRecognitionEntries = pgTable(
  'membership_dues_recognition_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => membershipDuesRecognitionSchedule.id),
    recognitionDate: date('recognition_date').notNull(),
    recognizedCents: integer('recognized_cents').notNull(),
    cumulativeRecognizedCents: integer('cumulative_recognized_cents').notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_mdre_schedule_date').on(table.tenantId, table.scheduleId, table.recognitionDate),
    index('idx_mdre_tenant_schedule').on(table.tenantId, table.scheduleId),
    index('idx_mdre_tenant_date').on(table.tenantId, table.recognitionDate),
    check('chk_mdre_recognized_cents', sql`recognized_cents > 0`),
  ],
);

// ── Inferred types ────────────────────────────────────────────────
export type MembershipDuesRecognitionScheduleRecord = typeof membershipDuesRecognitionSchedule.$inferSelect;
export type NewMembershipDuesRecognitionScheduleRecord = typeof membershipDuesRecognitionSchedule.$inferInsert;
export type MembershipDuesRecognitionEntryRecord = typeof membershipDuesRecognitionEntries.$inferSelect;
export type NewMembershipDuesRecognitionEntryRecord = typeof membershipDuesRecognitionEntries.$inferInsert;
