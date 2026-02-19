import {
  pgTable,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { courses } from './courses';

// ── rm_golf_tee_time_demand ─────────────────────────────────────
// Daily tee time booking demand aggregates by course and business date.
// Updated by tee_time.booked.v1, tee_time.cancelled.v1, tee_time.no_show_marked.v1.
export const rmGolfTeeTimeDemand = pgTable(
  'rm_golf_tee_time_demand',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    slotsBooked: integer('slots_booked').notNull().default(0),
    slotsAvailable: integer('slots_available').notNull().default(0),
    onlineSlotsBooked: integer('online_slots_booked').notNull().default(0),
    cancellations: integer('cancellations').notNull().default(0),
    noShows: integer('no_shows').notNull().default(0),
    utilizationBps: integer('utilization_bps').notNull().default(0),
    revenueBooked: numeric('revenue_booked', { precision: 19, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_tee_time_demand_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.businessDate,
    ),
    index('idx_rm_golf_tee_time_demand_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_hourly_distribution ─────────────────────────────────
// Demand by hour-of-day for tee time heat maps.
// Updated by tee_time.booked.v1, tee_time.cancelled.v1.
export const rmGolfHourlyDistribution = pgTable(
  'rm_golf_hourly_distribution',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    hourOfDay: smallint('hour_of_day').notNull(),
    slotsBooked: integer('slots_booked').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_hourly_dist_tenant_course_date_hour').on(
      table.tenantId,
      table.courseId,
      table.businessDate,
      table.hourOfDay,
    ),
    index('idx_rm_golf_hourly_dist_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_booking_lead_time ───────────────────────────────────
// How far in advance tee times are booked (lead time distribution).
// Updated by tee_time.booked.v1.
export const rmGolfBookingLeadTime = pgTable(
  'rm_golf_booking_lead_time',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    sameDayCount: integer('same_day_count').notNull().default(0),
    oneDayCount: integer('one_day_count').notNull().default(0),
    twoToSevenCount: integer('two_to_seven_count').notNull().default(0),
    eightPlusCount: integer('eight_plus_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_booking_lead_time_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.businessDate,
    ),
    index('idx_rm_golf_booking_lead_time_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_tee_time_fact ────────────────────────────────────────
// Individual tee time lifecycle tracking (one row per reservation).
// Created on booking, updated through check-in → start → completion.
export const rmGolfTeeTimeFact = pgTable(
  'rm_golf_tee_time_fact',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    locationId: text('location_id').notNull(),
    reservationId: text('reservation_id').notNull(),
    businessDate: date('business_date').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('booked'),
    partySizeBooked: integer('party_size_booked').notNull(),
    partySizeActual: integer('party_size_actual'),
    bookingSource: text('booking_source').notNull(),
    bookingType: text('booking_type').notNull().default('public'),
    customerId: text('customer_id'),
    customerName: text('customer_name'),
    walkingCount: integer('walking_count'),
    ridingCount: integer('riding_count'),
    holes: integer('holes').notNull().default(18),
    greenFeeCents: integer('green_fee_cents').notNull().default(0),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    startDelayMin: integer('start_delay_min'),
    isLateStart: boolean('is_late_start').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    holesCompleted: integer('holes_completed'),
    durationMinutes: integer('duration_minutes'),
    paceMinutesPerHole: numeric('pace_minutes_per_hole', { precision: 5, scale: 1 }),
    actualGreenFee: numeric('actual_green_fee', { precision: 19, scale: 4 }).notNull().default('0'),
    actualCartFee: numeric('actual_cart_fee', { precision: 19, scale: 4 }).notNull().default('0'),
    actualOtherFees: numeric('actual_other_fees', { precision: 19, scale: 4 }).notNull().default('0'),
    foodBev: numeric('food_bev', { precision: 19, scale: 4 }).notNull().default('0'),
    proShop: numeric('pro_shop', { precision: 19, scale: 4 }).notNull().default('0'),
    tax: numeric('tax', { precision: 19, scale: 4 }).notNull().default('0'),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_fact_tenant_reservation').on(table.tenantId, table.reservationId),
    index('idx_rm_golf_fact_tenant_course_date').on(table.tenantId, table.courseId, table.businessDate),
    index('idx_rm_golf_fact_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_rm_golf_fact_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── rm_golf_ops_daily ────────────────────────────────────────────
// Start delay and schedule compliance per course per day.
export const rmGolfOpsDaily = pgTable(
  'rm_golf_ops_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    startsCount: integer('starts_count').notNull().default(0),
    lateStartsCount: integer('late_starts_count').notNull().default(0),
    totalStartDelayMin: integer('total_start_delay_min').notNull().default(0),
    avgStartDelayMin: numeric('avg_start_delay_min', { precision: 8, scale: 2 }).notNull().default('0'),
    intervalCompliancePct: integer('interval_compliance_pct').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_ops_daily_tenant_course_date').on(table.tenantId, table.courseId, table.businessDate),
    index('idx_rm_golf_ops_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_pace_daily ───────────────────────────────────────────
// Round duration and slow rounds per course per day.
export const rmGolfPaceDaily = pgTable(
  'rm_golf_pace_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    roundsCompleted: integer('rounds_completed').notNull().default(0),
    totalDurationMin: integer('total_duration_min').notNull().default(0),
    avgRoundDurationMin: numeric('avg_round_duration_min', { precision: 8, scale: 2 }).notNull().default('0'),
    slowRoundsCount: integer('slow_rounds_count').notNull().default(0),
    avgMinutesPerHole: numeric('avg_minutes_per_hole', { precision: 8, scale: 2 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_pace_daily_tenant_course_date').on(table.tenantId, table.courseId, table.businessDate),
    index('idx_rm_golf_pace_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_revenue_daily ────────────────────────────────────────
// Revenue breakdown by category per course per day.
export const rmGolfRevenueDaily = pgTable(
  'rm_golf_revenue_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    greenFeeRevenue: numeric('green_fee_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    cartFeeRevenue: numeric('cart_fee_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    rangeFeeRevenue: numeric('range_fee_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    foodBevRevenue: numeric('food_bev_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    proShopRevenue: numeric('pro_shop_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 19, scale: 4 }).notNull().default('0'),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    roundsPlayed: integer('rounds_played').notNull().default(0),
    revPerRound: numeric('rev_per_round', { precision: 19, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_revenue_daily_tenant_course_date').on(table.tenantId, table.courseId, table.businessDate),
    index('idx_rm_golf_revenue_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_customer_play ────────────────────────────────────────
// Customer play activity (lifetime aggregate).
export const rmGolfCustomerPlay = pgTable(
  'rm_golf_customer_play',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    customerName: text('customer_name'),
    totalRounds: integer('total_rounds').notNull().default(0),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
    totalPartySize: integer('total_party_size').notNull().default(0),
    avgPartySize: numeric('avg_party_size', { precision: 5, scale: 1 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_customer_play_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_rm_golf_customer_play_last_played').on(table.tenantId, table.lastPlayedAt),
  ],
);

// ── rm_golf_channel_daily ────────────────────────────────────────
// Channel mix and lead time per course per day.
export const rmGolfChannelDaily = pgTable(
  'rm_golf_channel_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    businessDate: date('business_date').notNull(),
    onlineSlotsBooked: integer('online_slots_booked').notNull().default(0),
    proshopSlotsBooked: integer('proshop_slots_booked').notNull().default(0),
    phoneSlotsBooked: integer('phone_slots_booked').notNull().default(0),
    memberRounds: integer('member_rounds').notNull().default(0),
    publicRounds: integer('public_rounds').notNull().default(0),
    leagueRounds: integer('league_rounds').notNull().default(0),
    outingRounds: integer('outing_rounds').notNull().default(0),
    bookingCount: integer('booking_count').notNull().default(0),
    totalLeadTimeHours: integer('total_lead_time_hours').notNull().default(0),
    avgLeadTimeHours: numeric('avg_lead_time_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    lastMinuteCount: integer('last_minute_count').notNull().default(0),
    advancedCount: integer('advanced_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_channel_daily_tenant_course_date').on(table.tenantId, table.courseId, table.businessDate),
    index('idx_rm_golf_channel_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_golf_pace_checkpoints ─────────────────────────────────────
// Raw pace checkpoint data for V2 hole-by-hole analytics.
export const rmGolfPaceCheckpoints = pgTable(
  'rm_golf_pace_checkpoints',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    reservationId: text('reservation_id').notNull(),
    checkpoint: integer('checkpoint').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    elapsedMinutes: integer('elapsed_minutes'),
    expectedMinutes: integer('expected_minutes'),
    status: text('status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_golf_pace_checkpoints_tenant_res_cp').on(table.tenantId, table.reservationId, table.checkpoint),
    index('idx_rm_golf_pace_checkpoints_tenant_reservation').on(table.tenantId, table.reservationId),
  ],
);
