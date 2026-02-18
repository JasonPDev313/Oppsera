import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Management Companies ──────────────────────────────────────────

export const managementCompanies = pgTable(
  'management_companies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    hasCommonGiftCards: boolean('has_common_gift_cards').default(false),
    hasCommonCustomer: boolean('has_common_customer').default(false),
    hqLocationId: text('hq_location_id').references(() => locations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_management_companies_tenant').on(table.tenantId),
  ],
);

// ── Management Company Locations ──────────────────────────────────

export const managementCompanyLocations = pgTable(
  'management_company_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    managementCompanyId: text('management_company_id')
      .notNull()
      .references(() => managementCompanies.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_mgmt_co_locations_tenant_company_location').on(
      table.tenantId,
      table.managementCompanyId,
      table.locationId,
    ),
  ],
);

// ── Management Company Sub Groups ─────────────────────────────────

export const managementCompanySubGroups = pgTable(
  'management_company_sub_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    managementCompanyId: text('management_company_id')
      .notNull()
      .references(() => managementCompanies.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_mgmt_co_sub_groups_tenant_company').on(
      table.tenantId,
      table.managementCompanyId,
    ),
  ],
);

// ── Management Company Sub Group Locations ────────────────────────

export const managementCompanySubGroupLocations = pgTable(
  'management_company_sub_group_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subGroupId: text('sub_group_id')
      .notNull()
      .references(() => managementCompanySubGroups.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_mgmt_co_sub_group_locations_tenant_group_location').on(
      table.tenantId,
      table.subGroupId,
      table.locationId,
    ),
  ],
);
