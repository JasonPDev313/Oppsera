import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Reservation Resource Types ──────────────────────────────────

export const reservationResourceTypes = pgTable(
  'reservation_resource_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    chartOfAccountId: text('chart_of_account_id'),
    iconId: text('icon_id'),
    availableOnline: boolean('available_online').notNull().default(false),
    bookingWindowDays: integer('booking_window_days'),
    onlineBookingWindowDays: integer('online_booking_window_days'),
    maxReservationsPerDayPerCustomer: integer('max_reservations_per_day_per_customer'),
    bufferIntervalMinutes: integer('buffer_interval_minutes'),
    taxGroupId: text('tax_group_id'),
    maxParticipants: integer('max_participants'),
    userCanSelectResourcesOnline: boolean('user_can_select_resources_online').notNull().default(false),
    reservationStrategy: text('reservation_strategy').default('first_available'),
    reservationPolicies: text('reservation_policies'),
    displaySequence: integer('display_sequence').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_reservation_resource_types_tenant').on(table.tenantId)],
);

// ── Reservation Resources ───────────────────────────────────────

export const reservationResources = pgTable(
  'reservation_resources',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    typeId: text('type_id')
      .notNull()
      .references(() => reservationResourceTypes.id),
    availableOnline: boolean('available_online').notNull().default(false),
    displaySequence: integer('display_sequence').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_reservation_resources_tenant_type').on(table.tenantId, table.typeId)],
);

// ── Reservation Policies ────────────────────────────────────────

export const reservationPolicies = pgTable(
  'reservation_policies',
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
  (table) => [
    index('idx_reservation_policies_tenant_course').on(table.tenantId, table.courseId),
  ],
);

// ── Reservation Rate Override Rules ─────────────────────────────

export const reservationRateOverrideRules = pgTable(
  'reservation_rate_override_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    rackRateId: text('rack_rate_id'),
    classRuleId: text('class_rule_id'),
    startDate: date('start_date'),
    startTime: time('start_time'),
    endDate: date('end_date'),
    endTime: time('end_time'),
    providerName: text('provider_name'),
    providerIdentifier: text('provider_identifier'),
    rateCents: integer('rate_cents').notNull(),
    preventFurtherOverride: boolean('prevent_further_override').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reservation_rate_override_rules_tenant_course_start').on(
      table.tenantId,
      table.courseId,
      table.startDate,
    ),
  ],
);

// ── Reservation Dependent Blocks ────────────────────────────────

export const reservationDependentBlocks = pgTable(
  'reservation_dependent_blocks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    reservationResourceId: text('reservation_resource_id')
      .notNull()
      .references(() => reservationResources.id),
    blockRuleType: text('block_rule_type').notNull(),
    blockedResourceTypeId: text('blocked_resource_type_id'),
    blockedResourceId: text('blocked_resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reservation_dependent_blocks_tenant_resource').on(
      table.tenantId,
      table.reservationResourceId,
    ),
  ],
);

// ── On-Demand Availability Schedules ────────────────────────────

export const onDemandAvailabilitySchedules = pgTable(
  'on_demand_availability_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dayOfWeek: integer('day_of_week').notNull(),
    startMonth: integer('start_month'),
    startDay: integer('start_day'),
    endMonth: integer('end_month'),
    endDay: integer('end_day'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    orderType: text('order_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_on_demand_availability_schedules_tenant_dow').on(
      table.tenantId,
      table.dayOfWeek,
    ),
  ],
);

// ── Online Ordering Schedules ───────────────────────────────────

export const onlineOrderingSchedules = pgTable(
  'online_ordering_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dayOfWeek: integer('day_of_week').notNull(),
    startMonth: integer('start_month'),
    startDay: integer('start_day'),
    endMonth: integer('end_month'),
    endDay: integer('end_day'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_online_ordering_schedules_tenant_dow').on(table.tenantId, table.dayOfWeek),
  ],
);
