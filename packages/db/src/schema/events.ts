import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Events ────────────────────────────────────────────────────────

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    description: text('description'),
    eventType: text('event_type').notNull().default('general'),
    status: text('status').notNull().default('draft'),
    venue: text('venue'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    signupFeeCents: integer('signup_fee_cents').notNull().default(0),
    bannerImageUrl: text('banner_image_url'),
    registrationStartDate: date('registration_start_date'),
    registrationEndDate: date('registration_end_date'),
    gratuityPercentage: numeric('gratuity_percentage', { precision: 5, scale: 2 }),
    confirmationStatus: text('confirmation_status'),
    isTaxExempt: boolean('is_tax_exempt').notNull().default(false),
    taxExemptReason: text('tax_exempt_reason'),
    maxRegistrants: integer('max_registrants'),
    registrantsPerCustomer: integer('registrants_per_customer'),
    serviceFeeTaxGroupId: text('service_fee_tax_group_id'),
    isClosed: boolean('is_closed').notNull().default(false),
    closedDate: date('closed_date'),
    revenuePosted: boolean('revenue_posted').notNull().default(false),
    beo: text('beo'),
    useItemLevelServiceFee: boolean('use_item_level_service_fee').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_events_tenant_status').on(table.tenantId, table.status),
    index('idx_events_tenant_start_date').on(table.tenantId, table.startDate),
  ],
);

// ── Event Activities ──────────────────────────────────────────────

export const eventActivities = pgTable(
  'event_activities',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    location: text('location'),
    amountCents: integer('amount_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_activities_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Banquet Profiles ────────────────────────────────────────

export const eventBanquetProfiles = pgTable(
  'event_banquet_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    preliminaryGuestCount: integer('preliminary_guest_count'),
    finalGuestCount: integer('final_guest_count'),
    guestCountVerified: boolean('guest_count_verified').notNull().default(false),
    totalAmountCents: integer('total_amount_cents').notNull().default(0),
    depositedAmountCents: integer('deposited_amount_cents').notNull().default(0),
    balanceAmountCents: integer('balance_amount_cents').notNull().default(0),
    accountManager: text('account_manager'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_event_banquet_profiles_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Customer Groups ─────────────────────────────────────────

export const eventCustomerGroups = pgTable(
  'event_customer_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    customerGroupId: text('customer_group_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_event_customer_groups_tenant_event_group').on(
      table.tenantId,
      table.eventId,
      table.customerGroupId,
    ),
  ],
);

// ── Event Registrations ───────────────────────────────────────────

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    customerId: text('customer_id'),
    organizerCustomerId: text('organizer_customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    amountCents: integer('amount_cents').notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    orderId: text('order_id'),
    orderLineId: text('order_line_id'),
    sequence: integer('sequence'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_registrations_tenant_event').on(table.tenantId, table.eventId),
    index('idx_event_registrations_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Event Deposit Payments ────────────────────────────────────────

export const eventDepositPayments = pgTable(
  'event_deposit_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    paymentMethodId: text('payment_method_id').notNull(),
    eventGolferId: text('event_golfer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_deposit_payments_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Floor Plans ─────────────────────────────────────────────

export const eventFloorPlans = pgTable(
  'event_floor_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    floorPlanType: text('floor_plan_type').notNull(),
    floorPlanData: jsonb('floor_plan_data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_floor_plans_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Fee Types ───────────────────────────────────────────────

export const eventFeeTypes = pgTable(
  'event_fee_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_fee_types_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Notes ───────────────────────────────────────────────────

export const eventNotes = pgTable(
  'event_notes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    noteType: text('note_type').notNull().default('note'),
    content: text('content').notNull(),
    department: text('department'),
    eventTimelineId: text('event_timeline_id'),
    authorId: text('author_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_notes_tenant_event_type').on(table.tenantId, table.eventId, table.noteType),
  ],
);

// ── Event Timelines ───────────────────────────────────────────────

export const eventTimelines = pgTable(
  'event_timelines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startDate: date('start_date'),
    startTime: time('start_time'),
    endDate: date('end_date'),
    endTime: time('end_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_timelines_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Online Registration Settings ────────────────────────────

export const eventOnlineRegistrationSettings = pgTable(
  'event_online_registration_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    availableOnline: boolean('available_online').notNull().default(false),
    maxRegistrantsPerPlayer: integer('max_registrants_per_player'),
    requiresFirstName: boolean('requires_first_name').notNull().default(true),
    requiresLastName: boolean('requires_last_name').notNull().default(true),
    requiresEmail: boolean('requires_email').notNull().default(true),
    requiresPhone: boolean('requires_phone').notNull().default(false),
    onlineSignupLink: boolean('online_signup_link').notNull().default(false),
    link: text('link'),
    registrationStrategy: text('registration_strategy'),
    eventImageUrl: text('event_image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_event_online_reg_settings_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Products ────────────────────────────────────────────────

export const eventProducts = pgTable(
  'event_products',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id'),
    costPriceCents: integer('cost_price_cents'),
    unitListPriceCents: integer('unit_list_price_cents'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull().default(1),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    preparationInstructions: text('preparation_instructions'),
    mealType: text('meal_type'),
    productType: text('product_type'),
    gratuityApplicable: boolean('gratuity_applicable').notNull().default(false),
    eventTimelineId: text('event_timeline_id'),
    displaySequence: integer('display_sequence').notNull().default(0),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_products_tenant_event').on(table.tenantId, table.eventId)],
);

// ── Event Ledger Entries ──────────────────────────────────────────

export const eventLedgerEntries = pgTable(
  'event_ledger_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    paymentMethodId: text('payment_method_id'),
    description: text('description'),
    balanceCents: integer('balance_cents').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_ledger_entries_tenant_event').on(table.tenantId, table.eventId),
  ],
);

// ── Event Ledger Adjustments ──────────────────────────────────────

export const eventLedgerAdjustments = pgTable(
  'event_ledger_adjustments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventLedgerId: text('event_ledger_id').references(() => eventLedgerEntries.id),
    amountCents: integer('amount_cents').notNull(),
    description: text('description'),
    creditChartOfAccountId: text('credit_chart_of_account_id'),
    vendorId: text('vendor_id'),
    orderLineId: text('order_line_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_ledger_adjustments_tenant_event').on(table.tenantId, table.eventId),
  ],
);
