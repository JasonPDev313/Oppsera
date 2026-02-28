import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Tee Times ───────────────────────────────────────────────────

export const teeTimes = pgTable(
  'tee_times',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    holes: integer('holes').notNull().default(18),
    players: integer('players').notNull().default(1),
    carts: integer('carts').notNull().default(0),
    checkInStatus: text('check_in_status').notNull().default('pending'),
    orderId: text('order_id'),
    cartTotalCents: integer('cart_total_cents').notNull().default(0),
    bookingTotalCents: integer('booking_total_cents').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    bookingSource: text('booking_source').notNull().default('manual'),
    isValid: boolean('is_valid').notNull().default(true),
    notes: text('notes'),
    bookingClerkName: text('booking_clerk_name'),
    terminalId: text('terminal_id'),
    repetitionId: text('repetition_id'),
    prepaidAmountCents: integer('prepaid_amount_cents').notNull().default(0),
    partnerCode: text('partner_code'),
    commissionAmountCents: integer('commission_amount_cents').notNull().default(0),
    prepaidTaxCents: integer('prepaid_tax_cents').notNull().default(0),
    commissionTaxCents: integer('commission_tax_cents').notNull().default(0),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    primaryReservationId: text('primary_reservation_id'),
    noShow: boolean('no_show').notNull().default(false),
    lotteryRequestId: text('lottery_request_id'),
    isInLotteryWaitList: boolean('is_in_lottery_wait_list').notNull().default(false),
    isSqueezed: boolean('is_squeezed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_times_tenant_course_date').on(table.tenantId, table.courseId, table.teeDate),
    index('idx_tee_times_tenant_order')
      .on(table.tenantId, table.orderId)
      .where(sql`order_id IS NOT NULL`),
  ],
);

// ── Tee Time Slots ──────────────────────────────────────────────

export const teeTimeSlots = pgTable(
  'tee_time_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeTimeId: text('tee_time_id')
      .notNull()
      .references(() => teeTimes.id, { onDelete: 'cascade' }),
    holeGroup: text('hole_group').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    starterCheckTime: time('starter_check_time'),
    starterCheckInStatus: text('starter_check_in_status'),
    holeGroupEndTime: time('hole_group_end_time'),
    reservationResourceId: text('reservation_resource_id'),
    bufferIntervalMinutes: integer('buffer_interval_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_slots_tenant_time').on(table.tenantId, table.teeTimeId),
  ],
);

// ── Tee Time Players ────────────────────────────────────────────

export const teeTimePlayers = pgTable(
  'tee_time_players',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeTimeId: text('tee_time_id')
      .notNull()
      .references(() => teeTimes.id, { onDelete: 'cascade' }),
    customerId: text('customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    mobileNo: text('mobile_no'),
    isOrganiser: boolean('is_organiser').notNull().default(false),
    teePricingPlanId: text('tee_pricing_plan_id'),
    priceCents: integer('price_cents').notNull().default(0),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    unitListPriceCents: integer('unit_list_price_cents').notNull().default(0),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    checkInStatus: text('check_in_status').notNull().default('pending'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    orderId: text('order_id'),
    orderLineId: text('order_line_id'),
    cartNumber: text('cart_number'),
    classRuleId: text('class_rule_id'),
    rackRateId: text('rack_rate_id'),
    notes: text('notes'),
    punchCardRateId: text('punch_card_rate_id'),
    rateOverrideRuleId: text('rate_override_rule_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_players_tenant_time').on(table.tenantId, table.teeTimeId),
    index('idx_tee_time_players_tenant_customer')
      .on(table.tenantId, table.customerId)
      .where(sql`customer_id IS NOT NULL`),
  ],
);

// ── Tee Time Order Lines ────────────────────────────────────────

export const teeTimeOrderLines = pgTable(
  'tee_time_order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeTimeId: text('tee_time_id')
      .notNull()
      .references(() => teeTimes.id, { onDelete: 'cascade' }),
    teeTimePlayerId: text('tee_time_player_id'),
    customerId: text('customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    mobileNo: text('mobile_no'),
    isOrganiser: boolean('is_organiser').notNull().default(false),
    teePricingPlanId: text('tee_pricing_plan_id'),
    priceCents: integer('price_cents').notNull().default(0),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    unitListPriceCents: integer('unit_list_price_cents').notNull().default(0),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    checkInStatus: text('check_in_status'),
    paymentStatus: text('payment_status'),
    orderId: text('order_id'),
    orderLineId: text('order_line_id'),
    cartNumber: text('cart_number'),
    classRuleId: text('class_rule_id'),
    rackRateId: text('rack_rate_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_order_lines_tenant_time').on(table.tenantId, table.teeTimeId),
  ],
);

// ── Tee Time Payments ───────────────────────────────────────────

export const teeTimePayments = pgTable(
  'tee_time_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeTimeId: text('tee_time_id')
      .notNull()
      .references(() => teeTimes.id, { onDelete: 'cascade' }),
    paymentMethodId: text('payment_method_id'),
    walletId: text('wallet_id'),
    teeTimePlayerId: text('tee_time_player_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_payments_tenant_time').on(table.tenantId, table.teeTimeId),
  ],
);

// ── Tee Time Repetitions ────────────────────────────────────────

export const teeTimeRepetitions = pgTable(
  'tee_time_repetitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    holes: integer('holes').notNull().default(18),
    players: integer('players').notNull().default(1),
    bookingTotalCents: integer('booking_total_cents').notNull().default(0),
    bookingSource: text('booking_source').notNull().default('manual'),
    notes: text('notes'),
    bookingClerkName: text('booking_clerk_name'),
    terminalId: text('terminal_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_repetitions_tenant_course').on(table.tenantId, table.courseId),
  ],
);

// ── Tee Time Repetition Members ─────────────────────────────────

export const teeTimeRepetitionMembers = pgTable(
  'tee_time_repetition_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repetitionId: text('repetition_id')
      .notNull()
      .references(() => teeTimeRepetitions.id, { onDelete: 'cascade' }),
    customerId: text('customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    mobileNo: text('mobile_no'),
    isOrganiser: boolean('is_organiser').notNull().default(false),
    teePricingPlanId: text('tee_pricing_plan_id'),
    priceCents: integer('price_cents').notNull().default(0),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    rackRateId: text('rack_rate_id'),
    cartNumber: text('cart_number'),
    classRuleId: text('class_rule_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_repetition_members_tenant_rep').on(table.tenantId, table.repetitionId),
  ],
);

// ── Tee Time Repetition Rules ───────────────────────────────────

export const teeTimeRepetitionRules = pgTable(
  'tee_time_repetition_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repetitionId: text('repetition_id')
      .notNull()
      .references(() => teeTimeRepetitions.id, { onDelete: 'cascade' }),
    frequency: text('frequency').notNull(),
    intervalValue: integer('interval_value').notNull().default(1),
    intervalUnit: text('interval_unit').notNull().default('week'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    endType: text('end_type').notNull().default('date'),
    maxOccurrences: integer('max_occurrences'),
    daysOfWeek: jsonb('days_of_week'),
    monthlyRepetitionType: text('monthly_repetition_type'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_repetition_rules_tenant_rep').on(table.tenantId, table.repetitionId),
  ],
);

// ── Tee Time Repetition Rule Interpretations ────────────────────

export const teeTimeRepetitionRuleInterpretations = pgTable(
  'tee_time_repetition_rule_interpretations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repetitionId: text('repetition_id')
      .notNull()
      .references(() => teeTimeRepetitions.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id').notNull(),
    firstOccurrenceDate: date('first_occurrence_date').notNull(),
    dayDifference: integer('day_difference').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_rep_rule_interps_tenant_rep').on(table.tenantId, table.repetitionId),
  ],
);

// ── Tee Time Repetition Slots ───────────────────────────────────

export const teeTimeRepetitionSlots = pgTable(
  'tee_time_repetition_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repetitionId: text('repetition_id')
      .notNull()
      .references(() => teeTimeRepetitions.id, { onDelete: 'cascade' }),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    holeGroup: text('hole_group').notNull(),
    reservationResourceId: text('reservation_resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_time_repetition_slots_tenant_rep').on(table.tenantId, table.repetitionId),
  ],
);

// ── Shotgun Start Slots ─────────────────────────────────────────

export const shotgunStartSlots = pgTable(
  'shotgun_start_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    shotgunStartId: text('shotgun_start_id').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    holeGroup: text('hole_group').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_shotgun_start_slots_tenant_shotgun').on(table.tenantId, table.shotgunStartId),
  ],
);

// ── Tee Group Bookings ──────────────────────────────────────────

export const teeGroupBookings = pgTable(
  'tee_group_bookings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    teeDate: date('tee_date').notNull(),
    customerId: text('customer_id'),
    players: integer('players').notNull().default(1),
    holes: integer('holes').notNull().default(18),
    description: text('description'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    bookingSource: text('booking_source').notNull().default('manual'),
    checkInStatus: text('check_in_status').notNull().default('pending'),
    isValid: boolean('is_valid').notNull().default(true),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_group_bookings_tenant_course_date').on(
      table.tenantId,
      table.courseId,
      table.teeDate,
    ),
  ],
);

// ── Tee Group Booking Checkins ──────────────────────────────────

export const teeGroupBookingCheckins = pgTable(
  'tee_group_booking_checkins',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeGroupBookingId: text('tee_group_booking_id')
      .notNull()
      .references(() => teeGroupBookings.id, { onDelete: 'cascade' }),
    orderId: text('order_id'),
    orderLineId: text('order_line_id'),
    players: integer('players').notNull().default(1),
    totalCents: integer('total_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    includesCart: boolean('includes_cart').notNull().default(false),
    pricingOptionId: text('pricing_option_id'),
    rackRateId: text('rack_rate_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_group_booking_checkins_tenant_group').on(
      table.tenantId,
      table.teeGroupBookingId,
    ),
  ],
);

// ── Tee Group Booking Pricing Options ───────────────────────────

export const teeGroupBookingPricingOptions = pgTable(
  'tee_group_booking_pricing_options',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeGroupBookingId: text('tee_group_booking_id'),
    repetitionId: text('repetition_id'),
    priceCents: integer('price_cents').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    includesCart: boolean('includes_cart').notNull().default(false),
    rackRateId: text('rack_rate_id'),
    groupId: text('group_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_group_booking_pricing_opts_tenant_group')
      .on(table.tenantId, table.teeGroupBookingId)
      .where(sql`tee_group_booking_id IS NOT NULL`),
  ],
);

// ── Tee Group Booking Slots ─────────────────────────────────────

export const teeGroupBookingSlots = pgTable(
  'tee_group_booking_slots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teeGroupBookingId: text('tee_group_booking_id'),
    repetitionId: text('repetition_id'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    holeGroup: text('hole_group').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tee_group_booking_slots_tenant_group')
      .on(table.tenantId, table.teeGroupBookingId)
      .where(sql`tee_group_booking_id IS NOT NULL`),
  ],
);
