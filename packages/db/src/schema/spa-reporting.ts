import {
  pgTable,
  text,
  integer,
  date,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Spa Daily Operations Read Model ─────────────────────────────
// Pre-aggregated daily spa metrics per location.
// Updated by spa appointment lifecycle event consumers.
export const rmSpaDailyOperations = pgTable(
  'rm_spa_daily_operations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    appointmentCount: integer('appointment_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    canceledCount: integer('canceled_count').notNull().default(0),
    noShowCount: integer('no_show_count').notNull().default(0),
    walkInCount: integer('walk_in_count').notNull().default(0),
    onlineBookingCount: integer('online_booking_count').notNull().default(0),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    serviceRevenue: numeric('service_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    addonRevenue: numeric('addon_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    retailRevenue: numeric('retail_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    tipTotal: numeric('tip_total', { precision: 19, scale: 4 }).notNull().default('0'),
    avgAppointmentDuration: integer('avg_appointment_duration').notNull().default(0),
    utilizationPct: numeric('utilization_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    rebookingRate: numeric('rebooking_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_spa_daily_ops_tenant_loc_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_rm_spa_daily_ops_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── Spa Provider Metrics Read Model ─────────────────────────────
// Pre-aggregated provider (therapist/stylist) performance per period.
// Updated by spa appointment completion and feedback event consumers.
export const rmSpaProviderMetrics = pgTable(
  'rm_spa_provider_metrics',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id').notNull(),
    businessDate: date('business_date').notNull(),
    appointmentCount: integer('appointment_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    canceledCount: integer('canceled_count').notNull().default(0),
    noShowCount: integer('no_show_count').notNull().default(0),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    commissionTotal: numeric('commission_total', { precision: 19, scale: 4 }).notNull().default('0'),
    tipTotal: numeric('tip_total', { precision: 19, scale: 4 }).notNull().default('0'),
    avgServiceDuration: integer('avg_service_duration').notNull().default(0),
    utilizationPct: numeric('utilization_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    rebookingRate: numeric('rebooking_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).notNull().default('0'),
    clientCount: integer('client_count').notNull().default(0),
    newClientCount: integer('new_client_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_spa_provider_tenant_provider_date').on(
      table.tenantId,
      table.providerId,
      table.businessDate,
    ),
    index('idx_rm_spa_provider_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── Spa Service Metrics Read Model ──────────────────────────────
// Pre-aggregated service popularity and revenue.
// Updated by spa appointment lifecycle event consumers.
export const rmSpaServiceMetrics = pgTable(
  'rm_spa_service_metrics',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    serviceId: text('service_id').notNull(),
    businessDate: date('business_date').notNull(),
    bookingCount: integer('booking_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    canceledCount: integer('canceled_count').notNull().default(0),
    totalRevenue: numeric('total_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    avgPriceCents: integer('avg_price_cents').notNull().default(0),
    packageRedemptions: integer('package_redemptions').notNull().default(0),
    addonAttachmentRate: numeric('addon_attachment_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    avgDurationMinutes: integer('avg_duration_minutes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_spa_service_tenant_service_date').on(
      table.tenantId,
      table.serviceId,
      table.businessDate,
    ),
    index('idx_rm_spa_service_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── Spa Client Metrics Read Model ───────────────────────────────
// Pre-aggregated client activity for spa visits.
// Updated by spa appointment completion event consumers.
export const rmSpaClientMetrics = pgTable(
  'rm_spa_client_metrics',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    businessDate: date('business_date').notNull(),
    visitCount: integer('visit_count').notNull().default(0),
    totalSpend: numeric('total_spend', { precision: 19, scale: 4 }).notNull().default('0'),
    serviceCount: integer('service_count').notNull().default(0),
    addonCount: integer('addon_count').notNull().default(0),
    packagePurchases: integer('package_purchases').notNull().default(0),
    packageRedemptions: integer('package_redemptions').notNull().default(0),
    cancelCount: integer('cancel_count').notNull().default(0),
    noShowCount: integer('no_show_count').notNull().default(0),
    tipTotal: numeric('tip_total', { precision: 19, scale: 4 }).notNull().default('0'),
    lastVisitDate: date('last_visit_date'),
    daysSinceLastVisit: integer('days_since_last_visit').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_spa_client_tenant_customer_date').on(
      table.tenantId,
      table.customerId,
      table.businessDate,
    ),
    index('idx_rm_spa_client_tenant_date').on(table.tenantId, table.businessDate),
  ],
);
