import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Venue Types ───────────────────────────────────────────────────

export const venueTypes = pgTable(
  'venue_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_venue_types_tenant_title').on(table.tenantId, table.title),
  ],
);

// ── Venues ────────────────────────────────────────────────────────

export const venues = pgTable(
  'venues',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    venueTypeId: text('venue_type_id')
      .references(() => venueTypes.id),
    defaultSetupMinutes: integer('default_setup_minutes').notNull().default(0),
    defaultTearDownMinutes: integer('default_tear_down_minutes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_venues_tenant_type').on(table.tenantId, table.venueTypeId),
  ],
);

// ── Venue Schedules ───────────────────────────────────────────────

export const venueSchedules = pgTable(
  'venue_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    eventId: text('event_id'),
    customerId: text('customer_id'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    setupMinutes: integer('setup_minutes').notNull().default(0),
    tearDownMinutes: integer('tear_down_minutes').notNull().default(0),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_venue_schedules_tenant_venue_start').on(table.tenantId, table.venueId, table.startAt),
    index('idx_venue_schedules_tenant_event')
      .on(table.tenantId, table.eventId)
      .where(sql`event_id IS NOT NULL`),
  ],
);
