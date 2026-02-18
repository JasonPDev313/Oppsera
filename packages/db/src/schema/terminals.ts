import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Terminal Locations ────────────────────────────────────────────

export const terminalLocations = pgTable(
  'terminal_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    defaultMerchantReceiptPrint: text('default_merchant_receipt_print').default('auto'),
    defaultCustomerReceiptPrint: text('default_customer_receipt_print').default('auto'),
    defaultMerchantReceiptType: text('default_merchant_receipt_type').default('full'),
    defaultCustomerReceiptType: text('default_customer_receipt_type').default('full'),
    tipsApplicable: boolean('tips_applicable').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_terminal_locations_tenant').on(table.tenantId)],
);

// ── Terminals ────────────────────────────────────────────────────

export const terminals = pgTable(
  'terminals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalLocationId: text('terminal_location_id')
      .notNull()
      .references(() => terminalLocations.id),
    title: text('title').notNull(),
    showsDesktopNotification: boolean('shows_desktop_notification').notNull().default(false),
    requiresPinOnQuickTab: boolean('requires_pin_on_quick_tab').notNull().default(false),
    lockScreen: boolean('lock_screen').notNull().default(false),
    autoPinLockIdleSeconds: integer('auto_pin_lock_idle_seconds'),
    autoLogoutIdleSeconds: integer('auto_logout_idle_seconds'),
    autoPinLockRegisterIdleSeconds: integer('auto_pin_lock_register_idle_seconds'),
    autoSaveRegisterTabs: boolean('auto_save_register_tabs').notNull().default(false),
    enableSignatureTipAfterPayment: boolean('enable_signature_tip_after_payment')
      .notNull()
      .default(false),
    reopenTabsBehaviour: text('reopen_tabs_behaviour').default('ask'),
    requiresCustomerForTable: boolean('requires_customer_for_table').notNull().default(false),
    requireSeatCountForTable: boolean('require_seat_count_for_table').notNull().default(false),
    receiptPrinterId: text('receipt_printer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminals_tenant_location').on(table.tenantId, table.terminalLocationId),
  ],
);

// ── Terminal Card Readers ────────────────────────────────────────

export const terminalCardReaders = pgTable(
  'terminal_card_readers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cardTerminalType: text('card_terminal_type').notNull(),
    description: text('description'),
    model: text('model'),
    hasSignatureCapture: boolean('has_signature_capture').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_card_readers_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Terminal Card Reader Settings ────────────────────────────────

export const terminalCardReaderSettings = pgTable(
  'terminal_card_reader_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    cardReaderId: text('card_reader_id')
      .notNull()
      .references(() => terminalCardReaders.id),
    courseId: text('course_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_terminal_card_reader_settings_tenant_terminal_reader').on(
      table.tenantId,
      table.terminalId,
      table.cardReaderId,
    ),
  ],
);

// ── Day-End Closings ─────────────────────────────────────────────

export const dayEndClosings = pgTable(
  'day_end_closings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    closingDate: date('closing_date').notNull(),
    employeeId: text('employee_id'),
    floatAmountCents: integer('float_amount_cents').notNull().default(0),
    note: text('note'),
    amountData: jsonb('amount_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_day_end_closings_tenant_terminal_date').on(
      table.tenantId,
      table.terminalId,
      table.closingDate,
    ),
  ],
);

// ── Day-End Closing Payment Types ────────────────────────────────

export const dayEndClosingPaymentTypes = pgTable(
  'day_end_closing_payment_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dayEndClosingId: text('day_end_closing_id')
      .notNull()
      .references(() => dayEndClosings.id, { onDelete: 'cascade' }),
    paymentType: text('payment_type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_day_end_closing_payment_types_tenant_closing').on(
      table.tenantId,
      table.dayEndClosingId,
    ),
  ],
);

// ── Day-End Closing Cash Counts ──────────────────────────────────

export const dayEndClosingCashCounts = pgTable(
  'day_end_closing_cash_counts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    closingPaymentTypeId: text('closing_payment_type_id')
      .notNull()
      .references(() => dayEndClosingPaymentTypes.id, { onDelete: 'cascade' }),
    oneCent: integer('one_cent').notNull().default(0),
    fiveCent: integer('five_cent').notNull().default(0),
    tenCent: integer('ten_cent').notNull().default(0),
    twentyFiveCent: integer('twenty_five_cent').notNull().default(0),
    oneDollar: integer('one_dollar').notNull().default(0),
    fiveDollar: integer('five_dollar').notNull().default(0),
    tenDollar: integer('ten_dollar').notNull().default(0),
    twentyDollar: integer('twenty_dollar').notNull().default(0),
    fiftyDollar: integer('fifty_dollar').notNull().default(0),
    hundredDollar: integer('hundred_dollar').notNull().default(0),
    totalAmountCents: integer('total_amount_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_day_end_closing_cash_counts_tenant_payment_type').on(
      table.tenantId,
      table.closingPaymentTypeId,
    ),
  ],
);

// ── Terminal Location Tip Suggestions ────────────────────────────

export const terminalLocationTipSuggestions = pgTable(
  'terminal_location_tip_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalLocationId: text('terminal_location_id')
      .notNull()
      .references(() => terminalLocations.id),
    tipType: text('tip_type').notNull().default('percentage'),
    tipPercentage: numeric('tip_percentage', { precision: 5, scale: 2 }),
    tipAmountCents: integer('tip_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_location_tip_suggestions_tenant_location').on(
      table.tenantId,
      table.terminalLocationId,
    ),
  ],
);

// ── Terminal Location Floor Plans ────────────────────────────────

export const terminalLocationFloorPlans = pgTable(
  'terminal_location_floor_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalLocationId: text('terminal_location_id')
      .notNull()
      .references(() => terminalLocations.id),
    additionalTerminalLocationId: text('additional_terminal_location_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_location_floor_plans_tenant_location').on(
      table.tenantId,
      table.terminalLocationId,
    ),
  ],
);

// ── Drawer Events ────────────────────────────────────────────────

export const drawerEvents = pgTable(
  'drawer_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    employeeId: text('employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_drawer_events_tenant_terminal_created').on(
      table.tenantId,
      table.terminalId,
      table.createdAt,
    ),
  ],
);

// ── Register Notes ───────────────────────────────────────────────

export const registerNotes = pgTable(
  'register_notes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id'),
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
  (table) => [index('idx_register_notes_tenant').on(table.tenantId)],
);

// ── Printers ─────────────────────────────────────────────────────

export const printers = pgTable(
  'printers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    tag: text('tag'),
    macAddress: text('mac_address'),
    serialNumber: text('serial_number'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_printers_tenant').on(table.tenantId)],
);

// ── Print Jobs ───────────────────────────────────────────────────

export const printJobs = pgTable(
  'print_jobs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    printerId: text('printer_id').references(() => printers.id),
    orderId: text('order_id'),
    orderDetailPreparationId: text('order_detail_preparation_id'),
    printJobType: text('print_job_type').notNull(),
    isPrinted: boolean('is_printed').notNull().default(false),
    printedAt: timestamp('printed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_print_jobs_tenant_printer_printed').on(
      table.tenantId,
      table.printerId,
      table.isPrinted,
    ),
    index('idx_print_jobs_tenant_order')
      .on(table.tenantId, table.orderId)
      .where(sql`order_id IS NOT NULL`),
  ],
);
