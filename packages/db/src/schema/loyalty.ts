import {
  pgTable,
  text,
  integer,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Loyalty Ledger Entries ────────────────────────────────────────

export const loyaltyLedgerEntries = pgTable(
  'loyalty_ledger_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    ledgerType: text('ledger_type').notNull(),
    points: bigint('points', { mode: 'number' }).notNull().default(0),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    entityId: text('entity_id'),
    entityType: text('entity_type'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_loyalty_ledger_entries_tenant_customer_created').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

// ── Loyalty Order Details ────────────────────────────────────────

export const loyaltyOrderDetails = pgTable(
  'loyalty_order_details',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderLineId: text('order_line_id').notNull(),
    points: bigint('points', { mode: 'number' }).notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    totalPoints: bigint('total_points', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_loyalty_order_details_tenant_order_line').on(table.tenantId, table.orderLineId),
  ],
);

// ── Loyalty Configurations ───────────────────────────────────────

export const loyaltyConfigurations = pgTable(
  'loyalty_configurations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id'),
    conversionAmountCents: integer('conversion_amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_loyalty_configurations_tenant').on(table.tenantId),
  ],
);

// ── Loyalty Award Details ────────────────────────────────────────

export const loyaltyAwardDetails = pgTable(
  'loyalty_award_details',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderLineId: text('order_line_id').notNull(),
    cashbackCents: integer('cashback_cents').notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    totalCashbackCents: integer('total_cashback_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_loyalty_award_details_tenant_order_line').on(table.tenantId, table.orderLineId),
  ],
);
