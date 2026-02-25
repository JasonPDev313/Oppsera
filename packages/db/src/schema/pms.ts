import {
  pgTable,
  text,
  integer,
  boolean,
  date,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, users } from './core';

// ── PMS Properties ──────────────────────────────────────────────
export const pmsProperties = pgTable(
  'pms_properties',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('America/New_York'),
    currency: text('currency').notNull().default('USD'),
    addressJson: jsonb('address_json').$type<Record<string, unknown>>(),
    taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    checkInTime: text('check_in_time').notNull().default('15:00'),
    checkOutTime: text('check_out_time').notNull().default('11:00'),
    nightAuditTime: text('night_audit_time').notNull().default('03:00'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    slug: text('slug'),
  },
  (table) => [index('idx_pms_properties_tenant').on(table.tenantId)],
);

// ── PMS Room Types ──────────────────────────────────────────────
export const pmsRoomTypes = pgTable(
  'pms_room_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    maxAdults: integer('max_adults').notNull().default(2),
    maxChildren: integer('max_children').notNull().default(0),
    maxOccupancy: integer('max_occupancy').notNull().default(2),
    bedsJson: jsonb('beds_json').$type<Array<{ type: string; count: number }>>(),
    amenitiesJson: jsonb('amenities_json').$type<string[]>(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_room_types_property').on(table.tenantId, table.propertyId),
    uniqueIndex('uq_pms_room_types_code').on(table.tenantId, table.propertyId, table.code),
  ],
);

// ── PMS Rooms ───────────────────────────────────────────────────
export const pmsRooms = pgTable(
  'pms_rooms',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    roomNumber: text('room_number').notNull(),
    floor: text('floor'),
    status: text('status').notNull().default('VACANT_CLEAN'),
    isOutOfOrder: boolean('is_out_of_order').notNull().default(false),
    outOfOrderReason: text('out_of_order_reason'),
    isActive: boolean('is_active').notNull().default(true),
    featuresJson: jsonb('features_json').$type<Record<string, unknown>>(),
    lastCleanedAt: timestamp('last_cleaned_at', { withTimezone: true }),
    lastCleanedBy: text('last_cleaned_by'),
    accessibilityJson: jsonb('accessibility_json').$type<Record<string, unknown>>().default({}),
    viewType: text('view_type'),
    wing: text('wing'),
    connectingRoomIds: text('connecting_room_ids').array().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_rooms_property').on(table.tenantId, table.propertyId),
    index('idx_pms_rooms_type').on(table.tenantId, table.propertyId, table.roomTypeId),
    index('idx_pms_rooms_status').on(table.tenantId, table.propertyId, table.status),
    uniqueIndex('uq_pms_rooms_number').on(table.tenantId, table.propertyId, table.roomNumber),
  ],
);

// ── PMS Rate Plans ──────────────────────────────────────────────
export const pmsRatePlans = pgTable(
  'pms_rate_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    defaultNightlyRateCents: integer('default_nightly_rate_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_rate_plans_property').on(table.tenantId, table.propertyId),
    uniqueIndex('uq_pms_rate_plans_code').on(table.tenantId, table.propertyId, table.code),
  ],
);

// ── PMS Rate Plan Prices ────────────────────────────────────────
export const pmsRatePlanPrices = pgTable(
  'pms_rate_plan_prices',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ratePlanId: text('rate_plan_id')
      .notNull()
      .references(() => pmsRatePlans.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    nightlyBaseCents: integer('nightly_base_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_rate_plan_prices_plan').on(table.ratePlanId, table.roomTypeId),
    index('idx_pms_rate_plan_prices_dates').on(
      table.ratePlanId,
      table.roomTypeId,
      table.startDate,
      table.endDate,
    ),
    check('chk_rate_price_dates', sql`end_date > start_date`),
  ],
);

// ── PMS Rate Packages ──────────────────────────────────────────
export const pmsRatePackages = pgTable(
  'pms_rate_packages',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ratePlanId: text('rate_plan_id').references(() => pmsRatePlans.id),
    includesJson: jsonb('includes_json')
      .notNull()
      .default([])
      .$type<
        Array<{
          itemCode: string;
          description: string;
          amountCents: number;
          entryType: string;
          frequency: 'per_night' | 'per_stay' | 'per_person_per_night';
        }>
      >(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_rate_packages_code').on(table.tenantId, table.propertyId, table.code),
    index('idx_pms_rate_packages_property').on(table.tenantId, table.propertyId),
  ],
);

// ── PMS Guests ──────────────────────────────────────────────────
export const pmsGuests = pgTable(
  'pms_guests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    customerId: text('customer_id'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    addressJson: jsonb('address_json').$type<Record<string, unknown>>(),
    preferencesJson: jsonb('preferences_json').$type<Record<string, unknown>>(),
    notes: text('notes'),
    totalStays: integer('total_stays').notNull().default(0),
    lastStayDate: date('last_stay_date'),
    isVip: boolean('is_vip').notNull().default(false),
    roomPreferencesJson: jsonb('room_preferences_json').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_guests_property').on(table.tenantId, table.propertyId),
    index('idx_pms_guests_email').on(table.tenantId, table.propertyId, table.email),
    index('idx_pms_guests_name').on(table.tenantId, table.propertyId, table.lastName, table.firstName),
  ],
);

// ── PMS Reservations ────────────────────────────────────────────
export const pmsReservations = pgTable(
  'pms_reservations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    guestId: text('guest_id').references(() => pmsGuests.id),
    primaryGuestJson: jsonb('primary_guest_json')
      .notNull()
      .$type<{ firstName: string; lastName: string; email?: string; phone?: string }>(),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    roomId: text('room_id').references(() => pmsRooms.id),
    ratePlanId: text('rate_plan_id').references(() => pmsRatePlans.id),
    checkInDate: date('check_in_date').notNull(),
    checkOutDate: date('check_out_date').notNull(),
    status: text('status').notNull().default('CONFIRMED'),
    sourceType: text('source_type').notNull().default('DIRECT'),
    sourceRef: text('source_ref'),
    adults: integer('adults').notNull().default(1),
    children: integer('children').notNull().default(0),
    nights: integer('nights').notNull().default(1),
    nightlyRateCents: integer('nightly_rate_cents').notNull(),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    feeCents: integer('fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    internalNotes: text('internal_notes'),
    guestNotes: text('guest_notes'),
    confirmationNumber: text('confirmation_number'),
    version: integer('version').notNull().default(1),
    restrictionOverride: boolean('restriction_override').notNull().default(false),
    depositPolicyId: text('deposit_policy_id'),
    cancellationPolicyId: text('cancellation_policy_id'),
    depositAmountCents: integer('deposit_amount_cents').notNull().default(0),
    depositPaidCents: integer('deposit_paid_cents').notNull().default(0),
    paymentMethodId: text('payment_method_id'),
    ratePackageId: text('rate_package_id'),
    groupId: text('group_id'),
    corporateAccountId: text('corporate_account_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedInBy: text('checked_in_by'),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    checkedOutBy: text('checked_out_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_reservations_property').on(table.tenantId, table.propertyId),
    index('idx_pms_reservations_status').on(table.tenantId, table.propertyId, table.status),
    index('idx_pms_reservations_dates').on(
      table.tenantId,
      table.propertyId,
      table.checkInDate,
      table.checkOutDate,
    ),
    index('idx_pms_reservations_guest').on(table.tenantId, table.guestId),
    index('idx_pms_reservations_room').on(table.tenantId, table.roomId),
    check('chk_reservation_dates', sql`check_out_date > check_in_date`),
  ],
);

// ── PMS Room Blocks ─────────────────────────────────────────────
export const pmsRoomBlocks = pgTable(
  'pms_room_blocks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomId: text('room_id')
      .notNull()
      .references(() => pmsRooms.id),
    reservationId: text('reservation_id').references(() => pmsReservations.id),
    blockType: text('block_type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_room_blocks_room').on(table.tenantId, table.roomId),
    index('idx_pms_room_blocks_reservation').on(table.reservationId),
    index('idx_pms_room_blocks_dates').on(
      table.tenantId,
      table.propertyId,
      table.startDate,
      table.endDate,
    ),
    check('chk_block_dates', sql`end_date > start_date`),
  ],
);

// ── PMS Folios ──────────────────────────────────────────────────
export const pmsFolios = pgTable(
  'pms_folios',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => pmsReservations.id),
    guestId: text('guest_id').references(() => pmsGuests.id),
    status: text('status').notNull().default('OPEN'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    feeCents: integer('fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    paymentCents: integer('payment_cents').notNull().default(0),
    balanceCents: integer('balance_cents').notNull().default(0),
    depositHeldCents: integer('deposit_held_cents').notNull().default(0),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_folios_reservation').on(table.reservationId),
    index('idx_pms_folios_property').on(table.tenantId, table.propertyId),
  ],
);

// ── PMS Folio Entries ───────────────────────────────────────────
export const pmsFolioEntries = pgTable(
  'pms_folio_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    folioId: text('folio_id')
      .notNull()
      .references(() => pmsFolios.id),
    entryType: text('entry_type').notNull(),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    businessDate: date('business_date').notNull(),
    sourceRef: text('source_ref'),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    postedBy: text('posted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_folio_entries_folio').on(table.folioId),
    index('idx_pms_folio_entries_type').on(table.folioId, table.entryType),
  ],
);

// ── PMS Room Status Log ─────────────────────────────────────────
export const pmsRoomStatusLog = pgTable(
  'pms_room_status_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomId: text('room_id')
      .notNull()
      .references(() => pmsRooms.id),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    businessDate: date('business_date').notNull(),
    reason: text('reason'),
    changedBy: text('changed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_room_status_log_room').on(table.roomId),
    index('idx_pms_room_status_log_date').on(table.tenantId, table.propertyId, table.businessDate),
  ],
);

// ── PMS Audit Log ───────────────────────────────────────────────
export const pmsAuditLog = pgTable(
  'pms_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    diffJson: jsonb('diff_json').$type<Record<string, { before: unknown; after: unknown }>>(),
    actorId: text('actor_id'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_audit_log_entity').on(table.tenantId, table.entityType, table.entityId),
    index('idx_pms_audit_log_date').on(table.tenantId, table.propertyId, table.createdAt),
  ],
);

// ── PMS Idempotency Keys ────────────────────────────────────────
export const pmsIdempotencyKeys = pgTable(
  'pms_idempotency_keys',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    command: text('command').notNull(),
    responseJson: jsonb('response_json'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_idempotency_keys').on(table.tenantId, table.key),
    index('idx_pms_idempotency_keys_expires').on(table.expiresAt),
  ],
);

// ── PMS Outbox ──────────────────────────────────────────────────
export const pmsOutbox = pgTable(
  'pms_outbox',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pms_outbox_status').on(table.status, table.createdAt)],
);

// ── PMS Rate Restrictions ─────────────────────────────────────
export const pmsRateRestrictions = pgTable(
  'pms_rate_restrictions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomTypeId: text('room_type_id').references(() => pmsRoomTypes.id),
    ratePlanId: text('rate_plan_id').references(() => pmsRatePlans.id),
    restrictionDate: date('restriction_date').notNull(),
    minStay: integer('min_stay'),
    maxStay: integer('max_stay'),
    cta: boolean('cta').notNull().default(false),
    ctd: boolean('ctd').notNull().default(false),
    stopSell: boolean('stop_sell').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_rate_restrictions_property').on(
      table.tenantId,
      table.propertyId,
      table.restrictionDate,
    ),
    index('idx_pms_rate_restrictions_room_type').on(
      table.tenantId,
      table.propertyId,
      table.roomTypeId,
      table.restrictionDate,
    ),
  ],
);

// ── PMS Payment Methods ─────────────────────────────────────────
export const pmsPaymentMethods = pgTable(
  'pms_payment_methods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    guestId: text('guest_id')
      .notNull()
      .references(() => pmsGuests.id),
    gateway: text('gateway').notNull().default('stripe'),
    gatewayCustomerId: text('gateway_customer_id'),
    gatewayPaymentMethodId: text('gateway_payment_method_id'),
    cardLastFour: text('card_last_four'),
    cardBrand: text('card_brand'),
    cardExpMonth: integer('card_exp_month'),
    cardExpYear: integer('card_exp_year'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_payment_methods_guest').on(table.tenantId, table.guestId),
  ],
);

// ── PMS Payment Transactions ────────────────────────────────────
export const pmsPaymentTransactions = pgTable(
  'pms_payment_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    folioId: text('folio_id').references(() => pmsFolios.id),
    reservationId: text('reservation_id').references(() => pmsReservations.id),
    paymentMethodId: text('payment_method_id').references(() => pmsPaymentMethods.id),
    gateway: text('gateway').notNull().default('stripe'),
    gatewayChargeId: text('gateway_charge_id'),
    gatewayRefundId: text('gateway_refund_id'),
    transactionType: text('transaction_type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('pending'),
    description: text('description'),
    idempotencyKey: text('idempotency_key'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_payment_transactions_folio').on(table.tenantId, table.folioId),
    index('idx_pms_payment_transactions_reservation').on(table.tenantId, table.reservationId),
  ],
);

// ── PMS Deposit Policies ────────────────────────────────────────
export const pmsDepositPolicies = pgTable(
  'pms_deposit_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    name: text('name').notNull(),
    depositType: text('deposit_type').notNull().default('first_night'),
    percentagePct: numeric('percentage_pct', { precision: 5, scale: 2 }),
    fixedAmountCents: integer('fixed_amount_cents'),
    chargeTiming: text('charge_timing').notNull().default('at_booking'),
    daysBefore: integer('days_before'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_deposit_policies_property').on(table.tenantId, table.propertyId),
  ],
);

// ── PMS Cancellation Policies ───────────────────────────────────
export const pmsCancellationPolicies = pgTable(
  'pms_cancellation_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    name: text('name').notNull(),
    penaltyType: text('penalty_type').notNull().default('none'),
    percentagePct: numeric('percentage_pct', { precision: 5, scale: 2 }),
    fixedAmountCents: integer('fixed_amount_cents'),
    deadlineHours: integer('deadline_hours').notNull().default(24),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_cancellation_policies_property').on(table.tenantId, table.propertyId),
  ],
);

// ── PMS Message Templates ──────────────────────────────────────
export const pmsMessageTemplates = pgTable(
  'pms_message_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    templateKey: text('template_key').notNull(),
    channel: text('channel').notNull(),
    subject: text('subject'),
    bodyTemplate: text('body_template').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_message_templates_tenant_property').on(table.tenantId, table.propertyId),
    uniqueIndex('uq_pms_message_templates_key').on(table.tenantId, table.propertyId, table.templateKey, table.channel),
  ],
);

// ── PMS Message Log ────────────────────────────────────────────
export const pmsMessageLog = pgTable(
  'pms_message_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    reservationId: text('reservation_id'),
    guestId: text('guest_id'),
    channel: text('channel').notNull(),
    direction: text('direction').notNull(),
    messageType: text('message_type').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    recipient: text('recipient'),
    status: text('status').notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    externalId: text('external_id'),
    metadataJson: jsonb('metadata_json').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_message_log_tenant_property').on(table.tenantId, table.propertyId),
    index('idx_pms_message_log_tenant_reservation').on(table.tenantId, table.reservationId),
    index('idx_pms_message_log_tenant_guest').on(table.tenantId, table.guestId),
  ],
);

// ── PMS Corporate Accounts ────────────────────────────────────────
export const pmsCorporateAccounts = pgTable(
  'pms_corporate_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id'),
    companyName: text('company_name').notNull(),
    taxId: text('tax_id'),
    billingAddressJson: jsonb('billing_address_json').$type<Record<string, unknown>>(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    defaultRatePlanId: text('default_rate_plan_id').references(() => pmsRatePlans.id),
    negotiatedDiscountPct: integer('negotiated_discount_pct').default(0),
    billingType: text('billing_type').notNull().default('credit_card'),
    paymentTermsDays: integer('payment_terms_days').default(30),
    creditLimitCents: integer('credit_limit_cents'),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_corporate_accounts_tenant_property').on(table.tenantId, table.propertyId),
    index('idx_pms_corporate_accounts_tenant_company').on(table.tenantId, table.companyName),
  ],
);

// ── PMS Groups ───────────────────────────────────────────────────
export const pmsGroups = pgTable(
  'pms_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    name: text('name').notNull(),
    groupType: text('group_type').notNull().default('other'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    corporateAccountId: text('corporate_account_id').references(() => pmsCorporateAccounts.id),
    ratePlanId: text('rate_plan_id').references(() => pmsRatePlans.id),
    negotiatedRateCents: integer('negotiated_rate_cents'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    cutoffDate: date('cutoff_date'),
    status: text('status').notNull().default('tentative'),
    totalRoomsBlocked: integer('total_rooms_blocked').notNull().default(0),
    roomsPickedUp: integer('rooms_picked_up').notNull().default(0),
    billingType: text('billing_type').notNull().default('individual'),
    masterFolioId: text('master_folio_id').references(() => pmsFolios.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_groups_tenant_property').on(table.tenantId, table.propertyId),
    index('idx_pms_groups_tenant_property_status').on(table.tenantId, table.propertyId, table.status),
    check('chk_pms_groups_dates', sql`end_date > start_date`),
  ],
);

// ── PMS Group Room Blocks ─────────────────────────────────────────
export const pmsGroupRoomBlocks = pgTable(
  'pms_group_room_blocks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    groupId: text('group_id')
      .notNull()
      .references(() => pmsGroups.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    blockDate: date('block_date').notNull(),
    roomsBlocked: integer('rooms_blocked').notNull().default(0),
    roomsPickedUp: integer('rooms_picked_up').notNull().default(0),
    released: boolean('released').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_group_room_blocks').on(table.tenantId, table.groupId, table.roomTypeId, table.blockDate),
    index('idx_pms_group_room_blocks_tenant_group').on(table.tenantId, table.groupId),
  ],
);

// ── PMS Corporate Rate Overrides ──────────────────────────────────
export const pmsCorporateRateOverrides = pgTable(
  'pms_corporate_rate_overrides',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    corporateAccountId: text('corporate_account_id')
      .notNull()
      .references(() => pmsCorporateAccounts.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    negotiatedRateCents: integer('negotiated_rate_cents').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_pms_corporate_rate_overrides_tenant_account').on(table.tenantId, table.corporateAccountId),
  ],
);

// ── PMS Revenue By Room Type (Read Model) ──────────────────────
export const rmPmsRevenueByRoomType = pgTable(
  'rm_pms_revenue_by_room_type',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    propertyId: text('property_id').notNull().references(() => pmsProperties.id),
    roomTypeId: text('room_type_id').notNull(),
    businessDate: date('business_date').notNull(),
    roomsSold: integer('rooms_sold').notNull().default(0),
    roomRevenueCents: integer('room_revenue_cents').notNull().default(0),
    taxRevenueCents: integer('tax_revenue_cents').notNull().default(0),
    adrCents: integer('adr_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_pms_revenue_room_type').on(table.tenantId, table.propertyId, table.roomTypeId, table.businessDate),
    index('idx_rm_pms_revenue_room_type_date').on(table.tenantId, table.propertyId, table.businessDate),
  ],
);

// ── PMS Housekeeping Productivity (Read Model) ─────────────────
export const rmPmsHousekeepingProductivity = pgTable(
  'rm_pms_housekeeping_productivity',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    propertyId: text('property_id').notNull().references(() => pmsProperties.id),
    housekeeperId: text('housekeeper_id').notNull(),
    businessDate: date('business_date').notNull(),
    roomsCleaned: integer('rooms_cleaned').notNull().default(0),
    totalMinutes: integer('total_minutes').notNull().default(0),
    avgMinutes: integer('avg_minutes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_pms_hk_productivity').on(table.tenantId, table.propertyId, table.housekeeperId, table.businessDate),
    index('idx_rm_pms_hk_productivity_date').on(table.tenantId, table.propertyId, table.businessDate),
  ],
);

// ── PMS Housekeepers ─────────────────────────────────────────────
export const pmsHousekeepers = pgTable(
  'pms_housekeepers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    phone: text('phone'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_housekeepers_tenant_property').on(table.tenantId, table.propertyId),
    uniqueIndex('uq_pms_housekeepers_tenant_property_user').on(table.tenantId, table.propertyId, table.userId),
  ],
);

// ── PMS Housekeeping Assignments ─────────────────────────────────
export const pmsHousekeepingAssignments = pgTable(
  'pms_housekeeping_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomId: text('room_id')
      .notNull()
      .references(() => pmsRooms.id),
    housekeeperId: text('housekeeper_id')
      .notNull()
      .references(() => pmsHousekeepers.id),
    businessDate: date('business_date').notNull(),
    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_hk_assignment_room_date').on(table.tenantId, table.roomId, table.businessDate),
    index('idx_pms_hk_assignments_property_date').on(table.tenantId, table.propertyId, table.businessDate),
    index('idx_pms_hk_assignments_housekeeper_date').on(table.tenantId, table.housekeeperId, table.businessDate),
  ],
);

// ── PMS Work Orders ──────────────────────────────────────────────
export const pmsWorkOrders = pgTable(
  'pms_work_orders',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomId: text('room_id'),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull().default('general'),
    priority: text('priority').notNull().default('medium'),
    status: text('status').notNull().default('open'),
    assignedTo: text('assigned_to'),
    reportedBy: text('reported_by').notNull(),
    estimatedHours: numeric('estimated_hours', { precision: 5, scale: 1 }),
    actualHours: numeric('actual_hours', { precision: 5, scale: 1 }),
    partsCostCents: integer('parts_cost_cents'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    dueDate: date('due_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_work_orders_tenant_property').on(table.tenantId, table.propertyId),
    index('idx_pms_work_orders_status').on(table.tenantId, table.propertyId, table.status),
  ],
);

// ── PMS Work Order Comments ──────────────────────────────────────
export const pmsWorkOrderComments = pgTable(
  'pms_work_order_comments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    workOrderId: text('work_order_id')
      .notNull()
      .references(() => pmsWorkOrders.id),
    comment: text('comment').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_pms_work_order_comments_wo').on(table.tenantId, table.workOrderId),
  ],
);

// ── Calendar Read Model: Segments ───────────────────────────────
export const rmPmsCalendarSegments = pgTable(
  'rm_pms_calendar_segments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomId: text('room_id')
      .notNull()
      .references(() => pmsRooms.id),
    businessDate: date('business_date').notNull(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => pmsReservations.id),
    status: text('status').notNull(),
    guestName: text('guest_name').notNull(),
    checkInDate: date('check_in_date').notNull(),
    checkOutDate: date('check_out_date').notNull(),
    sourceType: text('source_type').notNull().default('DIRECT'),
    colorKey: text('color_key').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rm_pms_calendar_segments_query').on(
      table.tenantId,
      table.propertyId,
      table.businessDate,
    ),
    uniqueIndex('uq_rm_pms_calendar_segments').on(
      table.tenantId,
      table.propertyId,
      table.roomId,
      table.businessDate,
    ),
    index('idx_rm_pms_calendar_segments_reservation').on(table.reservationId),
  ],
);

// ── Occupancy Read Model: Daily ─────────────────────────────────
export const rmPmsDailyOccupancy = pgTable(
  'rm_pms_daily_occupancy',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    businessDate: date('business_date').notNull(),
    totalRooms: integer('total_rooms').notNull().default(0),
    roomsOccupied: integer('rooms_occupied').notNull().default(0),
    roomsAvailable: integer('rooms_available').notNull().default(0),
    roomsOoo: integer('rooms_ooo').notNull().default(0),
    arrivals: integer('arrivals').notNull().default(0),
    departures: integer('departures').notNull().default(0),
    occupancyPct: numeric('occupancy_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    adrCents: integer('adr_cents').notNull().default(0),
    revparCents: integer('revpar_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_pms_daily_occupancy').on(
      table.tenantId,
      table.propertyId,
      table.businessDate,
    ),
  ],
);

// ── Pricing Rules ───────────────────────────────────────────────
export const pmsPricingRules = pgTable(
  'pms_pricing_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    name: text('name').notNull(),
    ruleType: text('rule_type').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    conditionsJson: jsonb('conditions_json').$type<Record<string, unknown>>().notNull().default({}),
    adjustmentsJson: jsonb('adjustments_json').$type<Record<string, unknown>>().notNull().default({}),
    floorCents: integer('floor_cents'),
    ceilingCents: integer('ceiling_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_pricing_rules_tenant_property').on(table.tenantId, table.propertyId),
    index('idx_pms_pricing_rules_active').on(table.tenantId, table.propertyId, table.isActive),
  ],
);

// ── Pricing Log ─────────────────────────────────────────────────
export const pmsPricingLog = pgTable(
  'pms_pricing_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => pmsRoomTypes.id),
    businessDate: date('business_date').notNull(),
    baseRateCents: integer('base_rate_cents').notNull(),
    adjustedRateCents: integer('adjusted_rate_cents').notNull(),
    rulesAppliedJson: jsonb('rules_applied_json').$type<Array<{ ruleId: string; ruleName: string; adjustment: number }>>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_pricing_log').on(table.tenantId, table.propertyId, table.roomTypeId, table.businessDate),
  ],
);

// ── PMS Channels ────────────────────────────────────────────────
export const pmsChannels = pgTable(
  'pms_channels',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    propertyId: text('property_id').notNull().references(() => pmsProperties.id),
    channelCode: text('channel_code').notNull(),
    displayName: text('display_name').notNull(),
    apiCredentialsJson: jsonb('api_credentials_json').$type<Record<string, unknown>>().notNull().default({}),
    mappingJson: jsonb('mapping_json').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    syncStatus: text('sync_status').notNull().default('idle'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pms_channels_tenant_property').on(table.tenantId, table.propertyId),
    uniqueIndex('uq_pms_channels_property_code').on(table.tenantId, table.propertyId, table.channelCode),
  ],
);

// ── PMS Channel Sync Log ────────────────────────────────────────
export const pmsChannelSyncLog = pgTable(
  'pms_channel_sync_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    channelId: text('channel_id').notNull().references(() => pmsChannels.id),
    direction: text('direction').notNull(),
    entityType: text('entity_type').notNull(),
    status: text('status').notNull(),
    recordsSynced: integer('records_synced').notNull().default(0),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_pms_channel_sync_log_channel').on(table.tenantId, table.channelId),
  ],
);

// ── PMS Booking Engine Config ───────────────────────────────────
export const pmsBookingEngineConfig = pgTable(
  'pms_booking_engine_config',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    propertyId: text('property_id').notNull().references(() => pmsProperties.id),
    isActive: boolean('is_active').notNull().default(false),
    widgetThemeJson: jsonb('widget_theme_json').$type<Record<string, unknown>>().notNull().default({}),
    allowedRatePlanIds: text('allowed_rate_plan_ids').array().notNull().default([]),
    minLeadTimeHours: integer('min_lead_time_hours').notNull().default(0),
    maxAdvanceDays: integer('max_advance_days').notNull().default(365),
    termsUrl: text('terms_url'),
    privacyUrl: text('privacy_url'),
    confirmationTemplateId: text('confirmation_template_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_booking_engine_config').on(table.tenantId, table.propertyId),
  ],
);

// ── Auto Room Assignment ─────────────────────────────────────────
export const pmsRoomAssignmentPreferences = pgTable(
  'pms_room_assignment_preferences',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => pmsProperties.id),
    name: text('name').notNull(),
    weight: integer('weight').notNull().default(50),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_room_assign_pref_tenant_property_name').on(
      table.tenantId,
      table.propertyId,
      table.name,
    ),
    index('idx_pms_room_assign_pref_tenant_property').on(table.tenantId, table.propertyId),
    check('chk_pms_room_assign_pref_weight', sql`weight >= 0 AND weight <= 100`),
  ],
);

// ── PMS Guest Portal Sessions ───────────────────────────────────
export const pmsGuestPortalSessions = pgTable(
  'pms_guest_portal_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    reservationId: text('reservation_id').notNull(),
    token: text('token').notNull(),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    preCheckinCompleted: boolean('pre_checkin_completed').notNull().default(false),
    roomPreferenceJson: jsonb('room_preference_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_pms_guest_portal_sessions_token').on(table.token),
    index('idx_pms_guest_portal_sessions_tenant').on(table.tenantId),
    index('idx_pms_guest_portal_sessions_reservation').on(table.tenantId, table.reservationId),
  ],
);

// ── PMS Loyalty Programs ──────────────────────────────────────────
export const pmsLoyaltyPrograms = pgTable(
  'pms_loyalty_programs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    pointsPerDollar: integer('points_per_dollar').notNull().default(10),
    pointsPerNight: integer('points_per_night').notNull().default(0),
    redemptionValueCents: integer('redemption_value_cents').notNull().default(1),
    tiersJson: jsonb('tiers_json').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pms_loyalty_programs_tenant').on(table.tenantId)],
);

// ── PMS Loyalty Members ───────────────────────────────────────────
export const pmsLoyaltyMembers = pgTable(
  'pms_loyalty_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    guestId: text('guest_id').notNull(),
    programId: text('program_id').notNull(),
    pointsBalance: integer('points_balance').notNull().default(0),
    lifetimePoints: integer('lifetime_points').notNull().default(0),
    currentTier: text('current_tier'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pms_loyalty_members').on(table.tenantId, table.guestId, table.programId),
    index('idx_pms_loyalty_members_tenant').on(table.tenantId),
    index('idx_pms_loyalty_members_guest').on(table.tenantId, table.guestId),
    index('idx_pms_loyalty_members_program').on(table.tenantId, table.programId),
  ],
);

// ── PMS Loyalty Transactions ──────────────────────────────────────
export const pmsLoyaltyTransactions = pgTable(
  'pms_loyalty_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    memberId: text('member_id').notNull(),
    transactionType: text('transaction_type').notNull(),
    points: integer('points').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reservationId: text('reservation_id'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_pms_loyalty_transactions_tenant').on(table.tenantId),
    index('idx_pms_loyalty_transactions_member').on(table.tenantId, table.memberId),
  ],
);
