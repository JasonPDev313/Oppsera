import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Punch Card Types ─────────────────────────────────────────────

export const punchCardTypes = pgTable(
  'punch_card_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    description: text('description'),
    totalAmountCents: integer('total_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_types_tenant').on(table.tenantId),
  ],
);

// ── Punch Cards ──────────────────────────────────────────────────

export const punchCards = pgTable(
  'punch_cards',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    punchCardTypeId: text('punch_card_type_id')
      .notNull()
      .references(() => punchCardTypes.id),
    customerId: text('customer_id').notNull(),
    title: text('title'),
    description: text('description'),
    orderId: text('order_id'),
    amountCents: integer('amount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    cardNumber: text('card_number'),
    cardNumberType: text('card_number_type'),
    expirationDate: date('expiration_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_cards_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_punch_cards_tenant_card_number')
      .on(table.tenantId, table.cardNumber)
      .where(sql`card_number IS NOT NULL`),
  ],
);

// ── Punch Card Rates ─────────────────────────────────────────────

export const punchCardRates = pgTable(
  'punch_card_rates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    punchCardId: text('punch_card_id')
      .notNull()
      .references(() => punchCards.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').notNull(),
    rackRateId: text('rack_rate_id'),
    classRuleId: text('class_rule_id'),
    quantity: integer('quantity').notNull().default(0),
    rateCents: integer('rate_cents').notNull().default(0),
    usageStrategyId: text('usage_strategy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_rates_tenant_card').on(table.tenantId, table.punchCardId),
  ],
);

// ── Punch Card Rate Usage Strategies ─────────────────────────────

export const punchCardRateUsageStrategies = pgTable(
  'punch_card_rate_usage_strategies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    punchCardId: text('punch_card_id')
      .notNull()
      .references(() => punchCards.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
    rateCents: integer('rate_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_rate_usage_strategies_tenant_card').on(table.tenantId, table.punchCardId),
  ],
);

// ── Punch Card Type Rates ────────────────────────────────────────

export const punchCardTypeRates = pgTable(
  'punch_card_type_rates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    punchCardTypeId: text('punch_card_type_id')
      .notNull()
      .references(() => punchCardTypes.id, { onDelete: 'cascade' }),
    rackRateId: text('rack_rate_id'),
    classRuleId: text('class_rule_id'),
    quantity: integer('quantity').notNull().default(0),
    rateCents: integer('rate_cents').notNull().default(0),
    usageStrategyId: text('usage_strategy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_type_rates_tenant_type').on(table.tenantId, table.punchCardTypeId),
  ],
);

// ── Punch Card Type Rate Usage Strategies ────────────────────────

export const punchCardTypeRateUsageStrategies = pgTable(
  'punch_card_type_rate_usage_strategies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    punchCardTypeId: text('punch_card_type_id')
      .notNull()
      .references(() => punchCardTypes.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
    rateCents: integer('rate_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_type_rate_usage_strategies_tenant_type').on(
      table.tenantId,
      table.punchCardTypeId,
    ),
  ],
);

// ── Punch Card Usages ────────────────────────────────────────────

export const punchCardUsages = pgTable(
  'punch_card_usages',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    punchCardId: text('punch_card_id')
      .notNull()
      .references(() => punchCards.id),
    punchCardRateId: text('punch_card_rate_id'),
    orderId: text('order_id'),
    teeBookingOrderLineId: text('tee_booking_order_line_id'),
    roundsUsed: integer('rounds_used').notNull().default(0),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_punch_card_usages_tenant_card').on(table.tenantId, table.punchCardId),
  ],
);
