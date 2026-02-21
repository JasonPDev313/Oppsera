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
import { tenants } from './core';

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
