import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Floor Plan Rooms ────────────────────────────────────────────

export const floorPlanRooms = pgTable(
  'floor_plan_rooms',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    widthFt: numeric('width_ft', { precision: 8, scale: 2 }).notNull(),
    heightFt: numeric('height_ft', { precision: 8, scale: 2 }).notNull(),
    gridSizeFt: numeric('grid_size_ft', { precision: 4, scale: 2 }).notNull().default('1.00'),
    scalePxPerFt: integer('scale_px_per_ft').notNull().default(20),
    unit: text('unit').notNull().default('feet'),
    defaultMode: text('default_mode').default('dining'),
    currentVersionId: text('current_version_id'),
    draftVersionId: text('draft_version_id'),
    capacity: integer('capacity'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: text('archived_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_floor_plan_rooms_tenant_location_slug').on(
      table.tenantId,
      table.locationId,
      table.slug,
    ),
    index('idx_floor_plan_rooms_tenant_location_active').on(
      table.tenantId,
      table.locationId,
      table.isActive,
    ),
  ],
);

// ── Floor Plan Versions ─────────────────────────────────────────

export const floorPlanVersions = pgTable(
  'floor_plan_versions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roomId: text('room_id')
      .notNull()
      .references(() => floorPlanRooms.id),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull().default('draft'),
    snapshotJson: jsonb('snapshot_json').notNull(),
    objectCount: integer('object_count').notNull().default(0),
    totalCapacity: integer('total_capacity').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    publishNote: text('publish_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_floor_plan_versions_room_number').on(table.roomId, table.versionNumber),
    index('idx_floor_plan_versions_room_status').on(table.roomId, table.status),
  ],
);

// ── Floor Plan Templates (v2 — replaces simpler table) ──────────

export const floorPlanTemplatesV2 = pgTable(
  'floor_plan_templates_v2',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').default('custom'),
    snapshotJson: jsonb('snapshot_json').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    widthFt: numeric('width_ft', { precision: 8, scale: 2 }).notNull(),
    heightFt: numeric('height_ft', { precision: 8, scale: 2 }).notNull(),
    objectCount: integer('object_count').notNull().default(0),
    totalCapacity: integer('total_capacity').notNull().default(0),
    isSystemTemplate: boolean('is_system_template').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_floor_plan_templates_v2_tenant_name')
      .on(table.tenantId, table.name),
  ],
);
