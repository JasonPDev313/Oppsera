import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Floor Plans ───────────────────────────────────────────────────

export const floorPlans = pgTable(
  'floor_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    floorPlanType: text('floor_plan_type').notNull(),
    floorPlanData: jsonb('floor_plan_data').notNull(),
    terminalLocationId: text('terminal_location_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_floor_plans_tenant_type').on(table.tenantId, table.floorPlanType),
  ],
);

// ── Floor Plan Templates ──────────────────────────────────────────

export const floorPlanTemplates = pgTable(
  'floor_plan_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    floorPlanType: text('floor_plan_type').notNull(),
    floorPlanData: jsonb('floor_plan_data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_floor_plan_templates_tenant_title').on(table.tenantId, table.title),
  ],
);
