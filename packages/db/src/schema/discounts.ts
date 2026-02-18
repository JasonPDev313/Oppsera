import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Discounts ──────────────────────────────────────────────────────

export const discounts = pgTable(
  'discounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    valueType: text('value_type').notNull(),
    valuePercentage: numeric('value_percentage', { precision: 5, scale: 2 }),
    valueAmountCents: integer('value_amount_cents'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_discounts_tenant_active').on(table.tenantId, table.isActive)],
);

// ── Discount Department Rules ──────────────────────────────────────

export const discountDepartmentRules = pgTable(
  'discount_department_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    discountId: text('discount_id')
      .notNull()
      .references(() => discounts.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    subDepartmentId: text('sub_department_id'),
    valueType: text('value_type').notNull(),
    valuePercentage: numeric('value_percentage', { precision: 5, scale: 2 }),
    valueAmountCents: integer('value_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_discount_dept_rules_tenant_discount').on(table.tenantId, table.discountId),
  ],
);

// ── Discount Schedules ─────────────────────────────────────────────

export const discountSchedules = pgTable(
  'discount_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    discountId: text('discount_id')
      .notNull()
      .references(() => discounts.id, { onDelete: 'cascade' }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_discount_schedules_tenant_discount').on(table.tenantId, table.discountId),
  ],
);

// ── Promo Codes ────────────────────────────────────────────────────

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(),
    title: text('title'),
    description: text('description'),
    discountType: text('discount_type').notNull(),
    discountValue: numeric('discount_value', { precision: 10, scale: 2 }).notNull(),
    discountId: text('discount_id').references(() => discounts.id),
    categoryId: text('category_id'),
    isOneTimeUse: boolean('is_one_time_use').notNull().default(false),
    isUsed: boolean('is_used').notNull().default(false),
    maxUses: integer('max_uses'),
    currentUses: integer('current_uses').notNull().default(0),
    expiresAt: date('expires_at'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_promo_codes_tenant_code').on(table.tenantId, table.code)],
);

// ── Rack Rates ─────────────────────────────────────────────────────

export const rackRates = pgTable(
  'rack_rates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    name: text('name').notNull(),
    rateCents: integer('rate_cents').notNull(),
    holes: integer('holes').notNull().default(18),
    includesCart: boolean('includes_cart').notNull().default(false),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    startMonth: integer('start_month'),
    startDay: integer('start_day'),
    endMonth: integer('end_month'),
    endDay: integer('end_day'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    isActive: boolean('is_active').notNull().default(true),
    availableOnline: boolean('available_online').notNull().default(false),
    displaySequence: integer('display_sequence').notNull().default(0),
    reservationResourceTypeId: text('reservation_resource_type_id'),
    catalogItemId: text('catalog_item_id'),
    durationMinutes: integer('duration_minutes'),
    bookingWindowDays: integer('booking_window_days'),
    onlineBookingWindowDays: integer('online_booking_window_days'),
    overrideAllRackRates: boolean('override_all_rack_rates').notNull().default(false),
    overrideAllClassRates: boolean('override_all_class_rates').notNull().default(false),
    description: text('description'),
    showInDistEngine: boolean('show_in_dist_engine').notNull().default(false),
    distEngineSequence: integer('dist_engine_sequence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rack_rates_tenant_course_active').on(table.tenantId, table.courseId, table.isActive),
  ],
);

// ── Rack Rate Schedules ────────────────────────────────────────────

export const rackRateSchedules = pgTable(
  'rack_rate_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    rackRateId: text('rack_rate_id')
      .notNull()
      .references(() => rackRates.id, { onDelete: 'cascade' }),
    rateCents: integer('rate_cents').notNull(),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    startMonth: integer('start_month'),
    startDay: integer('start_day'),
    endMonth: integer('end_month'),
    endDay: integer('end_day'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rack_rate_schedules_tenant_rate').on(table.tenantId, table.rackRateId),
  ],
);

// ── Catalog Pricing Schedules ──────────────────────────────────────

export const catalogPricingSchedules = pgTable(
  'catalog_pricing_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    catalogItemId: text('catalog_item_id').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    salePriceCents: integer('sale_price_cents').notNull(),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_catalog_pricing_schedules_tenant_item').on(table.tenantId, table.catalogItemId),
  ],
);
