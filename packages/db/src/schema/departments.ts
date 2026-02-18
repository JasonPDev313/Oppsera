import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Departments ───────────────────────────────────────────────────

export const departments = pgTable(
  'departments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_departments_tenant_name').on(table.tenantId, table.name),
  ],
);

// ── Department Settings ───────────────────────────────────────────

export const departmentSettings = pgTable(
  'department_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    settingKey: text('setting_key').notNull(),
    settingValue: jsonb('setting_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_department_settings_tenant_dept_key').on(
      table.tenantId,
      table.departmentId,
      table.settingKey,
    ),
  ],
);

// ── Accounting Sources ────────────────────────────────────────────

export const accountingSources = pgTable(
  'accounting_sources',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_accounting_sources_tenant_name').on(table.tenantId, table.name),
  ],
);

// ── Chart of Account Classifications ──────────────────────────────

export const chartOfAccountClassifications = pgTable(
  'chart_of_account_classifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_coa_classifications_tenant_code').on(table.tenantId, table.code),
  ],
);

// ── Chart of Account Associations ─────────────────────────────────

export const chartOfAccountAssociations = pgTable(
  'chart_of_account_associations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityTitle: text('entity_title'),
    chartOfAccountId: text('chart_of_account_id').notNull(),
    classificationId: text('classification_id').references(() => chartOfAccountClassifications.id),
    isQuickbookSync: boolean('is_quickbook_sync').notNull().default(false),
    accountType: text('account_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_coa_associations_tenant_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
  ],
);

// ── Journal Entry Configurations ──────────────────────────────────

export const journalEntryConfigurations = pgTable(
  'journal_entry_configurations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(),
    debitChartOfAccountId: text('debit_chart_of_account_id'),
    creditChartOfAccountId: text('credit_chart_of_account_id'),
    classificationId: text('classification_id').references(() => chartOfAccountClassifications.id),
    vendorId: text('vendor_id'),
    memo: text('memo'),
    useItemCost: boolean('use_item_cost').notNull().default(false),
    terminalLocationId: text('terminal_location_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_journal_entry_configs_tenant_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
  ],
);
