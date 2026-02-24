/**
 * Drizzle schema for customer_import_logs table.
 */

import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

export const customerImportLogs = pgTable('customer_import_logs', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  fileName: text('file_name').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  totalRows: integer('total_rows').notNull().default(0),
  successRows: integer('success_rows').notNull().default(0),
  updatedRows: integer('updated_rows').notNull().default(0),
  skippedRows: integer('skipped_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  errors: jsonb('errors'),
  columnMappings: jsonb('column_mappings'),
  duplicateStrategy: text('duplicate_strategy'),
  status: text('status').notNull().default('pending'),
  importedBy: text('imported_by'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
