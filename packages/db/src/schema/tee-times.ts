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

// ── Tee Seasons ───────────────────────────────────────────────────

export const teeSeasons = pgTable(
  'tee_seasons',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    title: text('title').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    cartPrice9Cents: integer('cart_price_9_cents'),
    cartPrice18Cents: integer('cart_price_18_cents'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tee_seasons_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Tee Sheets ────────────────────────────────────────────────────

export const teeSheets = pgTable(
  'tee_sheets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeSeasonId: text('tee_season_id').references(() => teeSeasons.id),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    intervalMinutes: integer('interval_minutes').notNull().default(10),
    monday: boolean('monday').notNull().default(true),
    tuesday: boolean('tuesday').notNull().default(true),
    wednesday: boolean('wednesday').notNull().default(true),
    thursday: boolean('thursday').notNull().default(true),
    friday: boolean('friday').notNull().default(true),
    saturday: boolean('saturday').notNull().default(true),
    sunday: boolean('sunday').notNull().default(true),
    intervalType: text('interval_type').default('fixed'),
    intervalValue1: integer('interval_value_1'),
    intervalValue2: integer('interval_value_2'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_sheets_tenant_course_season').on(
      table.tenantId,
      table.courseId,
      table.teeSeasonId,
    ),
  ],
);

// ── Tee Types ─────────────────────────────────────────────────────

export const teeTypes = pgTable(
  'tee_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeSeasonId: text('tee_season_id').references(() => teeSeasons.id),
    title: text('title').notNull(),
    includesCart: boolean('includes_cart').notNull().default(false),
    seasonPosition: integer('season_position').notNull().default(0),
    weekendOnly: boolean('weekend_only').notNull().default(false),
    validOnWeekends: boolean('valid_on_weekends').notNull().default(true),
    validOnWeekdays: boolean('valid_on_weekdays').notNull().default(true),
    availableOnline: boolean('available_online').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tee_types_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Tee Categories ────────────────────────────────────────────────

export const teeCategories = pgTable(
  'tee_categories',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tee_categories_tenant_course_title').on(
      table.tenantId,
      table.courseId,
      table.title,
    ),
  ],
);

// ── Tee Daily Periods ─────────────────────────────────────────────

export const teeDailyPeriods = pgTable(
  'tee_daily_periods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeSeasonId: text('tee_season_id').references(() => teeSeasons.id),
    title: text('title').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tee_daily_periods_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Tee Pricing Plans ─────────────────────────────────────────────

export const teePricingPlans = pgTable(
  'tee_pricing_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeSeasonId: text('tee_season_id').references(() => teeSeasons.id),
    teeTypeId: text('tee_type_id').references(() => teeTypes.id),
    teeCategoryId: text('tee_category_id').references(() => teeCategories.id),
    teeDailyPeriodId: text('tee_daily_period_id'),
    holeRate9Cents: integer('hole_rate_9_cents'),
    holeRate18Cents: integer('hole_rate_18_cents'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_pricing_plans_tenant_course_type').on(
      table.tenantId,
      table.courseId,
      table.teeTypeId,
    ),
  ],
);

// ── Tee Time Overrides ────────────────────────────────────────────

export const teeTimeOverrides = pgTable(
  'tee_time_overrides',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    title: text('title'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_overrides_tenant_course_start').on(
      table.tenantId,
      table.courseId,
      table.startDate,
    ),
  ],
);

// ── Tee Time Order Items ──────────────────────────────────────────

export const teeTimeOrderItems = pgTable(
  'tee_time_order_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id').notNull(),
    teeBookingId: text('tee_booking_id'),
    teeSeasonId: text('tee_season_id'),
    teeTypeId: text('tee_type_id'),
    teeCategoryId: text('tee_category_id'),
    teeSeasonTitle: text('tee_season_title'),
    teeTypeTitle: text('tee_type_title'),
    teeCategoryTitle: text('tee_category_title'),
    holes: integer('holes'),
    priceCents: integer('price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_order_items_tenant_order').on(table.tenantId, table.orderId),
  ],
);

// ── Tee Time Policies ─────────────────────────────────────────────

export const teeTimePolicies = pgTable(
  'tee_time_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tee_time_policies_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Tee Sheet Notes ───────────────────────────────────────────────

export const teeSheetNotes = pgTable(
  'tee_sheet_notes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    noteType: text('note_type').notNull().default('tee_sheet'),
    note: text('note').notNull(),
    noteStartDate: date('note_start_date'),
    noteEndDate: date('note_end_date'),
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
    index('idx_tee_sheet_notes_tenant_course_type').on(
      table.tenantId,
      table.courseId,
      table.noteType,
    ),
  ],
);

// ── Tee Promoted Slots ────────────────────────────────────────────

export const teePromotedSlots = pgTable(
  'tee_promoted_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    discountPercentage: numeric('discount_percentage', { precision: 5, scale: 2 }),
    holeGroup: text('hole_group'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_promoted_slots_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.teeDate,
    ),
  ],
);

// ── Tee Rotation Schedules ────────────────────────────────────────

export const teeRotationSchedules = pgTable(
  'tee_rotation_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    firstTee: text('first_tee'),
    tenthTee: text('tenth_tee'),
    nineteenthTee: text('nineteenth_tee'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_rotation_schedules_tenant_course_start').on(
      table.tenantId,
      table.courseId,
      table.startDate,
    ),
  ],
);

// ── Tee Blocked Slots ─────────────────────────────────────────────

export const teeBlockedSlots = pgTable(
  'tee_blocked_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    description: text('description'),
    holeGroup: text('hole_group'),
    eventId: text('event_id'),
    blockType: text('block_type').notNull().default('manual'),
    repetitionId: text('repetition_id'),
    reservationResourceId: text('reservation_resource_id'),
    teeBookingId: text('tee_booking_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_blocked_slots_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.teeDate,
    ),
  ],
);

// ── Tee Blocked Slot Repetitions ──────────────────────────────────

export const teeBlockedSlotRepetitions = pgTable(
  'tee_blocked_slot_repetitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    description: text('description'),
    holeGroup: text('hole_group'),
    eventId: text('event_id'),
    reservationResourceId: text('reservation_resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_blocked_slot_repetitions_tenant_course').on(table.tenantId, table.courseId),
  ],
);

// ── Shotgun Starts ────────────────────────────────────────────────

export const shotgunStarts = pgTable(
  'shotgun_starts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    title: text('title').notNull(),
    kickOffTime: time('kick_off_time').notNull(),
    holes: integer('holes').notNull().default(18),
    foursomesPerHole: integer('foursomes_per_hole').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_shotgun_starts_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.teeDate,
    ),
  ],
);
