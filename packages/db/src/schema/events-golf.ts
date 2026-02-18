import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Event Golfers ───────────────────────────────────────────────

export const eventGolfers = pgTable(
  'event_golfers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    customerId: text('customer_id'),
    feeTypeId: text('fee_type_id'),
    feePriceCents: integer('fee_price_cents').notNull().default(0),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_golfers_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Registration Order Lines ──────────────────────────────

export const eventRegistrationOrderLines = pgTable(
  'event_registration_order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    customerId: text('customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    amountCents: integer('amount_cents').notNull().default(0),
    orderLineId: text('order_line_id'),
    orderId: text('order_id'),
    eventRegistrationId: text('event_registration_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_registration_order_lines_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Order Lines ───────────────────────────────────────────

export const eventOrderLines = pgTable(
  'event_order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_order_lines_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Payments ──────────────────────────────────────────────

export const eventPayments = pgTable(
  'event_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    customerId: text('customer_id'),
    paymentType: text('payment_type').notNull(),
    paymentStatus: text('payment_status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull().default(0),
    transactionReference: text('transaction_reference'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    onlineFeeTypeId: text('online_fee_type_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_payments_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Schedules ─────────────────────────────────────────────

export const eventSchedules = pgTable(
  'event_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    scheduleDate: date('schedule_date').notNull(),
    holeGroup: text('hole_group'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_schedules_tenant_event_date').on(
      table.tenantId,
      table.eventId,
      table.scheduleDate,
    ),
  ],
);

// ── Event Schedule Resources ────────────────────────────────────

export const eventScheduleResources = pgTable(
  'event_schedule_resources',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    eventScheduleId: text('event_schedule_id').notNull(),
    resourceTypeId: text('resource_type_id'),
    resourceId: text('resource_id'),
    courseId: text('course_id'),
    startDate: date('start_date'),
    startTime: time('start_time'),
    endDate: date('end_date'),
    endTime: time('end_time'),
    holeGroups: text('hole_groups'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_schedule_resources_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Timeline Venue Schedules ──────────────────────────────

export const eventTimelineVenueSchedules = pgTable(
  'event_timeline_venue_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    eventTimelineId: text('event_timeline_id').notNull(),
    venueId: text('venue_id').notNull(),
    venueScheduleId: text('venue_schedule_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_timeline_venue_schedules_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Terminal Locations ────────────────────────────────────

export const eventTerminalLocations = pgTable(
  'event_terminal_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    terminalLocationId: text('terminal_location_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_event_terminal_locations_tenant_event_terminal').on(
      table.tenantId,
      table.eventId,
      table.terminalLocationId,
    ),
  ],
);

// ── Event Type Departments ──────────────────────────────────────

export const eventTypeDepartments = pgTable(
  'event_type_departments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    defaultInstructions: text('default_instructions'),
    displaySequence: integer('display_sequence').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_type_departments_tenant_type').on(table.tenantId, table.eventType),
  ],
);

// ── Event Type Meals ────────────────────────────────────────────

export const eventTypeMeals = pgTable(
  'event_type_meals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_type_meals_tenant_type').on(table.tenantId, table.eventType)],
);

// ── Golf League Profiles ────────────────────────────────────────

export const golfLeagueProfiles = pgTable(
  'golf_league_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    firstWeekHoleGroup: text('first_week_hole_group'),
    rotateFrontAndBack: boolean('rotate_front_and_back').notNull().default(false),
    weeklyOccurrence: text('weekly_occurrence'),
    rotateHoleGroup: text('rotate_hole_group'),
    firstInstanceSelectedCourses: jsonb('first_instance_selected_courses'),
    rotationSelectedCourses: jsonb('rotation_selected_courses'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_golf_league_profiles_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Golf League Fee Types ───────────────────────────────────────

export const golfLeagueFeeTypes = pgTable(
  'golf_league_fee_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    title: text('title').notNull(),
    totalGolfers: integer('total_golfers'),
    pricePerGolferCents: integer('price_per_golfer_cents'),
    includesCart: boolean('includes_cart').notNull().default(false),
    pricePerCartCents: integer('price_per_cart_cents'),
    taxPerGolferCents: integer('tax_per_golfer_cents'),
    taxPercentage: numeric('tax_percentage', { precision: 5, scale: 2 }),
    gratuityApplicable: boolean('gratuity_applicable').notNull().default(false),
    availableOnline: boolean('available_online').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_golf_league_fee_types_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Golf League Checkins ────────────────────────────────────────

export const golfLeagueCheckins = pgTable(
  'golf_league_checkins',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    golfLeagueFeeTypeId: text('golf_league_fee_type_id'),
    customerId: text('customer_id'),
    totalCents: integer('total_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    greenFeeCents: integer('green_fee_cents').notNull().default(0),
    cartFeeCents: integer('cart_fee_cents').notNull().default(0),
    includesCart: boolean('includes_cart').notNull().default(false),
    checkinDate: date('checkin_date').notNull(),
    orderId: text('order_id'),
    orderLineId: text('order_line_id'),
    eventScheduleId: text('event_schedule_id'),
    eventGolferId: text('event_golfer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_golf_league_checkins_tenant_event_date').on(
      table.tenantId,
      table.eventId,
      table.checkinDate,
    ),
  ],
);

// ── Golf League Golfer Details ──────────────────────────────────

export const golfLeagueGolferDetails = pgTable(
  'golf_league_golfer_details',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    golfersPerWeek: integer('golfers_per_week'),
    pricePerGolferCents: integer('price_per_golfer_cents'),
    includesCart: boolean('includes_cart').notNull().default(false),
    totalCarts: integer('total_carts'),
    pricePerCartCents: integer('price_per_cart_cents'),
    remarks: text('remarks'),
    numberOfWeeks: integer('number_of_weeks'),
    preLeagueFeesCents: integer('pre_league_fees_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_golf_league_golfer_details_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Golf Outing Profiles ────────────────────────────────────────

export const golfOutingProfiles = pgTable(
  'golf_outing_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    holeGroups: text('hole_groups'),
    courses: text('courses'),
    selectedCourses: jsonb('selected_courses'),
    totalGolfers: integer('total_golfers'),
    pricePerGolferCents: integer('price_per_golfer_cents'),
    includesCart: boolean('includes_cart').notNull().default(false),
    totalCarts: integer('total_carts'),
    pricePerCartCents: integer('price_per_cart_cents'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_golf_outing_profiles_tenant_event').on(table.tenantId, table.eventId),
  ],
);
