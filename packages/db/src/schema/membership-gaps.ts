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
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Membership Groups ───────────────────────────────────────────
export const membershipGroups = pgTable(
  'membership_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    primaryMembershipId: text('primary_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_groups_tenant_primary')
      .on(table.tenantId, table.primaryMembershipId)
      .where(sql`primary_membership_id IS NOT NULL`),
  ],
);

// ── Membership Group Sitters ────────────────────────────────────
export const membershipGroupSitters = pgTable(
  'membership_group_sitters',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipGroupId: text('membership_group_id')
      .notNull()
      .references(() => membershipGroups.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    gender: text('gender'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_group_sitters_tenant_group').on(
      table.tenantId,
      table.membershipGroupId,
    ),
  ],
);

// ── Membership Plan Billing Schedules ───────────────────────────
export const membershipPlanBillingSchedules = pgTable(
  'membership_plan_billing_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipPlanId: text('membership_plan_id').notNull(),
    jan: numeric('jan', { precision: 10, scale: 2 }).notNull().default('0'),
    feb: numeric('feb', { precision: 10, scale: 2 }).notNull().default('0'),
    mar: numeric('mar', { precision: 10, scale: 2 }).notNull().default('0'),
    apr: numeric('apr', { precision: 10, scale: 2 }).notNull().default('0'),
    may: numeric('may', { precision: 10, scale: 2 }).notNull().default('0'),
    jun: numeric('jun', { precision: 10, scale: 2 }).notNull().default('0'),
    jul: numeric('jul', { precision: 10, scale: 2 }).notNull().default('0'),
    aug: numeric('aug', { precision: 10, scale: 2 }).notNull().default('0'),
    sep: numeric('sep', { precision: 10, scale: 2 }).notNull().default('0'),
    oct: numeric('oct', { precision: 10, scale: 2 }).notNull().default('0'),
    nov: numeric('nov', { precision: 10, scale: 2 }).notNull().default('0'),
    dec: numeric('dec', { precision: 10, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_plan_billing_schedules_tenant_plan').on(
      table.tenantId,
      table.membershipPlanId,
    ),
  ],
);

// ── Membership Plan Sale Strategies ─────────────────────────────
export const membershipPlanSaleStrategies = pgTable(
  'membership_plan_sale_strategies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipPlanId: text('membership_plan_id').notNull(),
    title: text('title').notNull(),
    dueAmountCents: integer('due_amount_cents'),
    processFeeRate: numeric('process_fee_rate', { precision: 5, scale: 4 }),
    processFeeAmountCents: integer('process_fee_amount_cents'),
    subMemberLimit: integer('sub_member_limit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_plan_sale_strategies_tenant_plan').on(
      table.tenantId,
      table.membershipPlanId,
    ),
  ],
);

// ── Membership Plan Discount Rules ──────────────────────────────
export const membershipPlanDiscountRules = pgTable(
  'membership_plan_discount_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipPlanId: text('membership_plan_id').notNull(),
    departmentId: text('department_id').notNull(),
    subDepartmentId: text('sub_department_id'),
    discountPercentage: numeric('discount_percentage', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_plan_discount_rules_tenant_plan').on(
      table.tenantId,
      table.membershipPlanId,
    ),
  ],
);

// ── Membership Plan Courses ─────────────────────────────────────
export const membershipPlanCourses = pgTable(
  'membership_plan_courses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipPlanId: text('membership_plan_id').notNull(),
    courseId: text('course_id').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_membership_plan_courses_tenant_plan_course').on(
      table.tenantId,
      table.membershipPlanId,
      table.courseId,
    ),
  ],
);

// ── Membership Rules ────────────────────────────────────────────
export const membershipRules = pgTable(
  'membership_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    membershipPlanId: text('membership_plan_id'),
    title: text('title').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    rateCents: integer('rate_cents'),
    occupancy: numeric('occupancy', { precision: 5, scale: 2 }),
    classCapacity: integer('class_capacity'),
    durationMinutes: integer('duration_minutes'),
    holes: integer('holes'),
    includesCart: boolean('includes_cart').notNull().default(false),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    availableOnline: boolean('available_online').notNull().default(false),
    displaySequence: integer('display_sequence').notNull().default(0),
    reservationResourceTypeId: text('reservation_resource_type_id'),
    catalogItemId: text('catalog_item_id'),
    bookingWindowDays: integer('booking_window_days'),
    onlineBookingWindowDays: integer('online_booking_window_days'),
    isGuestRate: boolean('is_guest_rate').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_rules_tenant_course_active').on(
      table.tenantId,
      table.courseId,
      table.isActive,
    ),
  ],
);

// ── Membership Rule Plan Types ──────────────────────────────────
export const membershipRulePlanTypes = pgTable(
  'membership_rule_plan_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipRuleId: text('membership_rule_id')
      .notNull()
      .references(() => membershipRules.id, { onDelete: 'cascade' }),
    membershipPlanId: text('membership_plan_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_membership_rule_plan_types_tenant_rule_plan').on(
      table.tenantId,
      table.membershipRuleId,
      table.membershipPlanId,
    ),
  ],
);

// ── Membership Rule Schedules ───────────────────────────────────
export const membershipRuleSchedules = pgTable(
  'membership_rule_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    membershipRuleId: text('membership_rule_id')
      .notNull()
      .references(() => membershipRules.id, { onDelete: 'cascade' }),
    rateCents: integer('rate_cents'),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    startDate: date('start_date'),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_rule_schedules_tenant_rule').on(
      table.tenantId,
      table.membershipRuleId,
    ),
  ],
);

// ── Membership Plan Tee Pricing ─────────────────────────────────
export const membershipPlanTeePricing = pgTable(
  'membership_plan_tee_pricing',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipPlanId: text('membership_plan_id').notNull(),
    teePricingPlanId: text('tee_pricing_plan_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_membership_plan_tee_pricing_tenant_plan_tee').on(
      table.tenantId,
      table.membershipPlanId,
      table.teePricingPlanId,
    ),
  ],
);

// ── Membership Recurring Billing Items ──────────────────────────
export const membershipRecurringBillingItems = pgTable(
  'membership_recurring_billing_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerMembershipId: text('customer_membership_id').notNull(),
    title: text('title').notNull(),
    amountCents: integer('amount_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    frequency: integer('frequency').notNull().default(1),
    frequencyType: text('frequency_type').notNull().default('monthly'),
    notes: text('notes'),
    isValid: boolean('is_valid').notNull().default(true),
    taxGroupId: text('tax_group_id'),
    processFeeAmountCents: integer('process_fee_amount_cents').notNull().default(0),
    subMemberLimit: integer('sub_member_limit'),
    saleStrategyId: text('sale_strategy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_recurring_billing_items_tenant_membership').on(
      table.tenantId,
      table.customerMembershipId,
    ),
  ],
);

// ── Membership Recurring Billing Order Lines ────────────────────
export const membershipRecurringBillingOrderLines = pgTable(
  'membership_recurring_billing_order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipRecurringBillingId: text('membership_recurring_billing_id')
      .notNull()
      .references(() => membershipRecurringBillingItems.id),
    customerMembershipId: text('customer_membership_id').notNull(),
    orderLineItemId: text('order_line_item_id'),
    orderId: text('order_id'),
    title: text('title'),
    amountCents: integer('amount_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    frequency: integer('frequency'),
    frequencyType: text('frequency_type'),
    billedSinceDate: date('billed_since_date'),
    billedTillDate: date('billed_till_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_recurring_billing_order_lines_tenant_billing').on(
      table.tenantId,
      table.membershipRecurringBillingId,
    ),
  ],
);
