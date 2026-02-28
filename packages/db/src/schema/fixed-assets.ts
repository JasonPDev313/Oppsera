import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── fixed_assets ──────────────────────────────────────────────────
// Master register of capitalized fixed assets per tenant.
// GL account references are plain text (FK via migration to avoid circular import).
export const fixedAssets = pgTable(
  'fixed_assets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'), // FK to locations.id — added in migration
    assetNumber: text('asset_number').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // building, equipment, vehicle, furniture, technology, leasehold_improvement, other
    status: text('status').notNull().default('active'), // active, fully_depreciated, disposed, written_off
    acquisitionDate: date('acquisition_date').notNull(),
    acquisitionCost: numeric('acquisition_cost', { precision: 12, scale: 2 }).notNull(),
    salvageValue: numeric('salvage_value', { precision: 12, scale: 2 }).notNull().default('0'),
    usefulLifeMonths: integer('useful_life_months').notNull(),
    depreciationMethod: text('depreciation_method').notNull().default('straight_line'), // straight_line, declining_balance, sum_of_years, units_of_production
    assetGlAccountId: text('asset_gl_account_id'), // FK to gl_accounts.id
    depreciationExpenseAccountId: text('depreciation_expense_account_id'), // FK to gl_accounts.id
    accumulatedDepreciationAccountId: text('accumulated_depreciation_account_id'), // FK to gl_accounts.id
    disposalDate: date('disposal_date'),
    disposalProceeds: numeric('disposal_proceeds', { precision: 12, scale: 2 }),
    disposalGlAccountId: text('disposal_gl_account_id'), // FK to gl_accounts.id
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fixed_assets_tenant_asset_number').on(table.tenantId, table.assetNumber),
    index('idx_fixed_assets_tenant_status').on(table.tenantId, table.status),
    index('idx_fixed_assets_tenant_category').on(table.tenantId, table.category),
    index('idx_fixed_assets_tenant_location').on(table.tenantId, table.locationId),
    check('chk_fixed_assets_category', sql`category IN ('building','equipment','vehicle','furniture','technology','leasehold_improvement','other')`),
    check('chk_fixed_assets_status', sql`status IN ('active','fully_depreciated','disposed','written_off')`),
    check('chk_fixed_assets_acquisition_cost', sql`acquisition_cost >= 0`),
    check('chk_fixed_assets_salvage_value', sql`salvage_value >= 0`),
    check('chk_fixed_assets_useful_life', sql`useful_life_months > 0`),
  ],
);

// ── fixed_asset_depreciation ──────────────────────────────────────
// Append-only ledger of monthly depreciation entries per asset.
// Each row represents one period's depreciation with running totals.
export const fixedAssetDepreciation = pgTable(
  'fixed_asset_depreciation',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    assetId: text('asset_id')
      .notNull()
      .references(() => fixedAssets.id),
    periodDate: date('period_date').notNull(),
    depreciationAmount: numeric('depreciation_amount', { precision: 12, scale: 2 }).notNull(),
    accumulatedTotal: numeric('accumulated_total', { precision: 12, scale: 2 }).notNull(),
    netBookValue: numeric('net_book_value', { precision: 12, scale: 2 }).notNull(),
    glJournalEntryId: text('gl_journal_entry_id'), // FK to gl_journal_entries.id
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fixed_asset_depreciation_asset').on(table.tenantId, table.assetId),
    index('idx_fixed_asset_depreciation_period').on(table.tenantId, table.periodDate),
    uniqueIndex('uq_fixed_asset_depreciation_asset_period').on(table.tenantId, table.assetId, table.periodDate),
    check('chk_fixed_asset_depreciation_amount', sql`depreciation_amount >= 0`),
  ],
);

// ── Inferred types ────────────────────────────────────────────────
export type FixedAsset = typeof fixedAssets.$inferSelect;
export type NewFixedAsset = typeof fixedAssets.$inferInsert;
export type FixedAssetDepreciationRecord = typeof fixedAssetDepreciation.$inferSelect;
export type NewFixedAssetDepreciationRecord = typeof fixedAssetDepreciation.$inferInsert;
