import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Order Seats ─────────────────────────────────────────────────
export const orderSeats = pgTable(
  'order_seats',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id').notNull(),
    seatNumber: integer('seat_number').notNull(),
    customerId: text('customer_id'),
    customerName: text('customer_name'),
    tabName: text('tab_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_seats_tenant_order').on(table.tenantId, table.orderId),
  ],
);

// ── Order Tips ──────────────────────────────────────────────────
export const orderTips = pgTable(
  'order_tips',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    employeeId: text('employee_id'),
    terminalId: text('terminal_id'),
    paymentMethodId: text('payment_method_id'),
    appliedToPaymentMethodId: text('applied_to_payment_method_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_tips_tenant_order').on(table.tenantId, table.orderId),
  ],
);

// ── Order Status History ────────────────────────────────────────
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id').notNull(),
    referenceId: text('reference_id'),
    referenceType: text('reference_type'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_status_history_tenant_order_created').on(
      table.tenantId,
      table.orderId,
      table.createdAt,
    ),
  ],
);

// ── Order Line Preparations ─────────────────────────────────────
export const orderLinePreparations = pgTable(
  'order_line_preparations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderLineId: text('order_line_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    status: text('status').notNull().default('pending'),
    docketNumber: text('docket_number'),
    docketId: text('docket_id'),
    pushDateTime: timestamp('push_date_time', { withTimezone: true }),
    kdsSetting: text('kds_setting'),
    preparationInstructions: text('preparation_instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_line_preparations_tenant_line').on(table.tenantId, table.orderLineId),
  ],
);

// ── Order Preparation Dockets ───────────────────────────────────
export const orderPreparationDockets = pgTable(
  'order_preparation_dockets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    primaryOrderId: text('primary_order_id').notNull(),
    docketNumber: text('docket_number').notNull(),
    preparationInstructions: text('preparation_instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_preparation_dockets_tenant_order').on(table.tenantId, table.primaryOrderId),
  ],
);

// ── Meal Courses ────────────────────────────────────────────────
export const mealCourses = pgTable(
  'meal_courses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    displaySequence: integer('display_sequence').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_meal_courses_tenant_title').on(table.tenantId, table.title),
  ],
);

// ── Quick Menus ─────────────────────────────────────────────────
export const quickMenus = pgTable(
  'quick_menus',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    catalogItemId: text('catalog_item_id').notNull(),
    employeeId: text('employee_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_quick_menus_tenant_course_item_employee').on(
      table.tenantId,
      table.courseId,
      table.catalogItemId,
      table.employeeId,
    ),
  ],
);
