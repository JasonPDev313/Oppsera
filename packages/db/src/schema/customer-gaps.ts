import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Customer Addresses ────────────────────────────────────────────
// Moved to customer-identity.ts (Session 1) — enhanced with type, label,
// isPrimary, seasonal months, and proper NOT NULL constraints.

// ── Customer Facility Assignments ─────────────────────────────────
export const customerFacilityAssignments = pgTable(
  'customer_facility_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    assignmentType: text('assignment_type').notNull(),
    assignmentNumber: text('assignment_number'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_facility_assignments_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.assignmentType,
    ),
    uniqueIndex('uq_customer_facility_assignments_tenant_type_number')
      .on(table.tenantId, table.assignmentType, table.assignmentNumber)
      .where(sql`assignment_number IS NOT NULL`),
  ],
);

// ── Customer Location Settings ────────────────────────────────────
export const customerLocationSettings = pgTable(
  'customer_location_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    locationId: text('location_id').notNull(),
    disableOnlineTeeTimes: boolean('disable_online_tee_times').notNull().default(false),
    disableOnlineReservations: boolean('disable_online_reservations').notNull().default(false),
    serviceChargeExempt: boolean('service_charge_exempt').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_customer_location_settings_tenant_customer_location').on(
      table.tenantId,
      table.customerId,
      table.locationId,
    ),
  ],
);

// ── Customer Discount Overrides ───────────────────────────────────
export const customerDiscountOverrides = pgTable(
  'customer_discount_overrides',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    membershipId: text('membership_id'),
    departmentId: text('department_id'),
    discountPercentage: numeric('discount_percentage', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_discount_overrides_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);

// ── Customer Signed Waivers ───────────────────────────────────────
export const customerSignedWaivers = pgTable(
  'customer_signed_waivers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    courseId: text('course_id'),
    reservationId: text('reservation_id'),
    waiverContent: text('waiver_content').notNull(),
    signatureType: text('signature_type').notNull().default('digital'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_signed_waivers_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);

// ── Customer Pace of Play ───────────────────────────────────────
export const customerPaceOfPlay = pgTable(
  'customer_pace_of_play',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    courseId: text('course_id'),
    gameRoundId: text('game_round_id'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    trackedAt: timestamp('tracked_at', { withTimezone: true }).notNull().defaultNow(),
    holeNumber: integer('hole_number'),
    position: text('position'),
    status: text('status').notNull().default('active'),
    details: jsonb('details'),
    trackingType: text('tracking_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_pace_of_play_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_pace_of_play_tenant_round')
      .on(table.tenantId, table.gameRoundId)
      .where(sql`game_round_id IS NOT NULL`),
  ],
);

// ── Membership Applications ───────────────────────────────────────
export const membershipApplications = pgTable(
  'membership_applications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id'),
    membershipPlanId: text('membership_plan_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    applicationContent: jsonb('application_content'),
    approvalStatus: text('approval_status').notNull().default('pending'),
    completionStatus: text('completion_status').notNull().default('incomplete'),
    voucherId: text('voucher_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_applications_tenant_approval').on(
      table.tenantId,
      table.approvalStatus,
    ),
    index('idx_membership_applications_tenant_customer')
      .on(table.tenantId, table.customerId)
      .where(sql`customer_id IS NOT NULL`),
  ],
);
