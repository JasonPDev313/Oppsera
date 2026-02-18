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

// ── Employee Time Entries ─────────────────────────────────────────
export const employeeTimeEntries = pgTable(
  'employee_time_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: text('employee_id').notNull(),
    roleId: text('role_id'),
    clockInTime: timestamp('clock_in_time', { withTimezone: true }).notNull(),
    clockOutTime: timestamp('clock_out_time', { withTimezone: true }),
    clockInSource: text('clock_in_source').notNull().default('manual'),
    clockOutSource: text('clock_out_source'),
    approvalStatus: text('approval_status').notNull().default('pending'),
    adminComment: text('admin_comment'),
    comment: text('comment'),
    cashTipCents: integer('cash_tip_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_employee_time_entries_tenant_employee_clockin').on(
      table.tenantId,
      table.employeeId,
      table.clockInTime,
    ),
  ],
);

// ── Payroll Configurations ────────────────────────────────────────
export const payrollConfigurations = pgTable(
  'payroll_configurations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    payrollPeriod: text('payroll_period').notNull().default('biweekly'),
    weekStartDay: integer('week_start_day').notNull().default(1),
    nextPayrollStartDate: date('next_payroll_start_date'),
    firstDayOf1stPayPeriod: integer('first_day_of_1st_pay_period'),
    firstDayOf2ndPayPeriod: integer('first_day_of_2nd_pay_period'),
    overtimeEnabled: boolean('overtime_enabled').notNull().default(false),
    dailyOvertimeEnabled: boolean('daily_overtime_enabled').notNull().default(false),
    dailyDoubleOvertimeEnabled: boolean('daily_double_overtime_enabled').notNull().default(false),
    weeklyOvertimeAfterHours: numeric('weekly_overtime_after_hours', { precision: 5, scale: 2 }),
    dailyOvertimeAfterHours: numeric('daily_overtime_after_hours', { precision: 5, scale: 2 }),
    dailyDoubleOvertimeAfterHours: numeric('daily_double_overtime_after_hours', {
      precision: 5,
      scale: 2,
    }),
    payrollDayEndClosingTime: time('payroll_day_end_closing_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_payroll_configurations_tenant').on(table.tenantId)],
);

// ── Tip Ledger Entries ────────────────────────────────────────────
export const tipLedgerEntries = pgTable(
  'tip_ledger_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: text('employee_id').notNull(),
    description: text('description'),
    entityId: text('entity_id'),
    entityType: text('entity_type'),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tip_ledger_entries_tenant_employee_created').on(
      table.tenantId,
      table.employeeId,
      table.createdAt,
    ),
  ],
);

// ── Tip Sharing Rules ─────────────────────────────────────────────
export const tipSharingRules = pgTable(
  'tip_sharing_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fromEmployeeId: text('from_employee_id').notNull(),
    toEmployeeId: text('to_employee_id').notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }),
    amountCents: integer('amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tip_sharing_rules_tenant_from_employee').on(table.tenantId, table.fromEmployeeId),
  ],
);

// ── Food Commissions ──────────────────────────────────────────────
export const foodCommissions = pgTable(
  'food_commissions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    categoryId: text('category_id').notNull(),
    commissionPercentage: numeric('commission_percentage', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_food_commissions_tenant_course_category').on(
      table.tenantId,
      table.courseId,
      table.categoryId,
    ),
  ],
);
