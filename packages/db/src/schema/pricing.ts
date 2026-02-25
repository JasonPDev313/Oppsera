import { pgTable, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Pricing Plans (system-wide, one per tier) ──
export const pricingPlans = pgTable('pricing_plans', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tier: text('tier').notNull().unique(),
  displayName: text('display_name').notNull(),
  pricePerSeatCents: integer('price_per_seat_cents').notNull().default(2500),
  maxSeats: integer('max_seats'),
  baseFeeCents: integer('base_fee_cents').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  features: jsonb('features').notNull().default('[]'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Module Pricing (per-module add-on costs) ──
export const modulePricing = pgTable('module_pricing', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  moduleKey: text('module_key').notNull().unique(),
  displayName: text('display_name').notNull(),
  pricePerSeatCents: integer('price_per_seat_cents').notNull().default(0),
  flatFeeCents: integer('flat_fee_cents').notNull().default(0),
  isAddon: boolean('is_addon').notNull().default(false),
  includedInTiers: text('included_in_tiers').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Tenant Subscriptions (one per tenant) ──
export const tenantSubscriptions = pgTable('tenant_subscriptions', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .unique(),
  pricingPlanId: text('pricing_plan_id')
    .notNull()
    .references(() => pricingPlans.id),
  seatCount: integer('seat_count').notNull().default(1),
  monthlyTotalCents: integer('monthly_total_cents').notNull().default(0),
  status: text('status').notNull().default('active'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  addonModuleKeys: text('addon_module_keys').array().notNull().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Subscription Change Log (append-only) ──
export const subscriptionChangeLog = pgTable(
  'subscription_change_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    changedBy: text('changed_by').notNull(),
    changeType: text('change_type').notNull(),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sub_change_log_tenant').on(table.tenantId, table.createdAt)],
);
