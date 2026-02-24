/**
 * Drizzle schema for staff_import_jobs + staff_import_rows tables.
 * Used by the intelligent staff import wizard.
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Staff Import Jobs ────────────────────────────────────────────────
export const staffImportJobs = pgTable(
  'staff_import_jobs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    totalRows: integer('total_rows').notNull().default(0),
    importMode: text('import_mode').notNull().default('upsert'),
    status: text('status').notNull().default('pending'),

    columnMappings: jsonb('column_mappings'),
    valueMappings: jsonb('value_mappings'),

    defaultRoleId: text('default_role_id'),
    defaultLocationIds: jsonb('default_location_ids'),
    autoGenerateUsername: boolean('auto_generate_username').notNull().default(true),

    createdCount: integer('created_count').notNull().default(0),
    updatedCount: integer('updated_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),

    importedBy: text('imported_by'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_staff_import_jobs_tenant').on(table.tenantId),
    index('idx_staff_import_jobs_status').on(table.tenantId, table.status),
  ],
);

// ── Staff Import Rows (staging) ──────────────────────────────────────
export const staffImportRows = pgTable(
  'staff_import_rows',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    jobId: text('job_id')
      .notNull()
      .references(() => staffImportJobs.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    rowNumber: integer('row_number').notNull(),
    rawData: jsonb('raw_data').notNull(),

    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    username: text('username'),
    phone: text('phone'),
    statusValue: text('status_value'),

    roleId: text('role_id'),
    roleRaw: text('role_raw'),
    locationIds: jsonb('location_ids'),
    locationRaw: text('location_raw'),

    posPin: text('pos_pin'),
    overridePin: text('override_pin'),
    tabColor: text('tab_color'),
    employeeColor: text('employee_color'),
    externalPayrollEmployeeId: text('external_payroll_employee_id'),
    externalPayrollId: text('external_payroll_id'),

    matchType: text('match_type'),
    matchedUserId: text('matched_user_id'),
    action: text('action').notNull().default('pending'),

    isValid: boolean('is_valid').notNull().default(false),
    errors: jsonb('errors'),
    warnings: jsonb('warnings'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_staff_import_rows_job').on(table.jobId),
    index('idx_staff_import_rows_tenant').on(table.tenantId),
    index('idx_staff_import_rows_action').on(table.jobId, table.action),
  ],
);
