import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  date,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Import Jobs ────────────────────────────────────────────────────
export const importJobs = pgTable(
  'import_jobs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').references(() => locations.id),
    name: text('name').notNull(),
    status: text('status').notNull().default('analyzing'),
    mode: text('mode').notNull().default('operational'),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    fileHash: text('file_hash').notNull(),
    rowCount: integer('row_count'),
    sourceSystem: text('source_system'),

    // Analysis results
    detectedColumns: jsonb('detected_columns'),
    detectedStructure: text('detected_structure'),
    groupingKey: text('grouping_key'),

    // Reconciliation totals
    legacyRevenueCents: integer('legacy_revenue_cents'),
    legacyPaymentCents: integer('legacy_payment_cents'),
    legacyTaxCents: integer('legacy_tax_cents'),
    legacyRowCount: integer('legacy_row_count'),
    oppseraRevenueCents: integer('oppsera_revenue_cents'),
    oppseraPaymentCents: integer('oppsera_payment_cents'),
    oppseraTaxCents: integer('oppsera_tax_cents'),
    oppseraOrderCount: integer('oppsera_order_count'),

    // Progress
    totalRows: integer('total_rows').notNull().default(0),
    processedRows: integer('processed_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    skippedRows: integer('skipped_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    quarantinedRows: integer('quarantined_rows').notNull().default(0),

    // Metadata
    businessDateFrom: date('business_date_from'),
    businessDateTo: date('business_date_to'),
    importedBy: text('imported_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_jobs_tenant').on(table.tenantId, table.createdAt),
    uniqueIndex('uq_import_jobs_tenant_hash')
      .on(table.tenantId, table.fileHash)
      .where(sql`status NOT IN ('cancelled', 'failed')`),
  ],
);

// ── Import Column Mappings ─────────────────────────────────────────
export const importColumnMappings = pgTable(
  'import_column_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    sourceColumn: text('source_column').notNull(),
    targetEntity: text('target_entity').notNull(),
    targetField: text('target_field').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    confidenceReason: text('confidence_reason'),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    dataType: text('data_type'),
    transformRule: text('transform_rule'),
    sampleValues: jsonb('sample_values'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_column_mappings_job').on(table.importJobId),
  ],
);

// ── Import Tender Mappings ─────────────────────────────────────────
export const importTenderMappings = pgTable(
  'import_tender_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    legacyValue: text('legacy_value').notNull(),
    oppseraTenderType: text('oppsera_tender_type').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    occurrenceCount: integer('occurrence_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_tender_mappings_job').on(table.importJobId),
  ],
);

// ── Import Tax Mappings ────────────────────────────────────────────
export const importTaxMappings = pgTable(
  'import_tax_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    legacyColumn: text('legacy_column').notNull(),
    legacyRate: numeric('legacy_rate', { precision: 8, scale: 4 }),
    oppseraTaxGroupId: text('oppsera_tax_group_id'),
    taxMode: text('tax_mode').notNull().default('exclusive'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_tax_mappings_job').on(table.importJobId),
  ],
);

// ── Import Item Mappings ───────────────────────────────────────────
export const importItemMappings = pgTable(
  'import_item_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    legacyItemName: text('legacy_item_name').notNull(),
    legacyItemSku: text('legacy_item_sku'),
    oppseraCatalogItemId: text('oppsera_catalog_item_id'),
    strategy: text('strategy').notNull().default('auto'),
    occurrenceCount: integer('occurrence_count').notNull().default(0),
    totalRevenueCents: integer('total_revenue_cents').notNull().default(0),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_item_mappings_job').on(table.importJobId),
  ],
);

// ── Import Errors ──────────────────────────────────────────────────
export const importErrors = pgTable(
  'import_errors',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    message: text('message').notNull(),
    sourceData: jsonb('source_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_errors_job').on(table.importJobId, table.severity),
  ],
);

// ── Import Staged Rows ─────────────────────────────────────────────
export const importStagedRows = pgTable(
  'import_staged_rows',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    groupKey: text('group_key').notNull(),
    entityType: text('entity_type').notNull(),
    parsedData: jsonb('parsed_data').notNull(),
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_staged_rows_job_group').on(table.importJobId, table.groupKey),
    index('idx_import_staged_rows_job_status').on(table.importJobId, table.status),
  ],
);
