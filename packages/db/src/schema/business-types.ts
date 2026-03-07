import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Business Categories ─────────────────────────────────────────
// System-seeded grouping layer — NOT tenant-scoped
export const businessCategories = pgTable('business_categories', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Business Types ──────────────────────────────────────────────
// Stable identity record — NOT versioned, NOT tenant-scoped
export const businessTypes = pgTable('business_types', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  categoryId: text('category_id')
    .notNull()
    .references(() => businessCategories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  iconKey: text('icon_key'),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  showAtSignup: boolean('show_at_signup').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Business Type Versions ──────────────────────────────────────
// Versioned editable/publishable state
export const businessTypeVersions = pgTable(
  'business_type_versions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    businessTypeId: text('business_type_id')
      .notNull()
      .references(() => businessTypes.id),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull().default('draft'), // draft | published | archived
    changeSummary: text('change_summary'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_btv_type_version').on(table.businessTypeId, table.versionNumber),
    // Only one active draft per business type
    uniqueIndex('uq_btv_active_draft').on(table.businessTypeId).where(
      sql`status = 'draft'`,
    ),
    index('idx_btv_type_status').on(table.businessTypeId, table.status),
    check('chk_btv_status', sql`status IN ('draft', 'published', 'archived')`),
  ],
);

// ── Business Type Module Defaults ───────────────────────────────
// One row per module per version
export const businessTypeModuleDefaults = pgTable(
  'business_type_module_defaults',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    businessTypeVersionId: text('business_type_version_id')
      .notNull()
      .references(() => businessTypeVersions.id),
    moduleKey: text('module_key').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    accessMode: text('access_mode').notNull().default('full'), // off | view | full
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_btmd_version_module').on(table.businessTypeVersionId, table.moduleKey),
    check('chk_btmd_access_mode', sql`access_mode IN ('off', 'view', 'full')`),
  ],
);

// ── Business Type Accounting Templates ──────────────────────────
// One row per version — typed JSON sections
export const businessTypeAccountingTemplates = pgTable(
  'business_type_accounting_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    businessTypeVersionId: text('business_type_version_id')
      .notNull()
      .unique()
      .references(() => businessTypeVersions.id),
    coaTemplateRef: text('coa_template_ref'),
    revenueCategories: jsonb('revenue_categories').notNull().default('{}'),
    paymentGlMappings: jsonb('payment_gl_mappings').notNull().default('{}'),
    taxBehavior: jsonb('tax_behavior').notNull().default('{}'),
    deferredRevenue: jsonb('deferred_revenue').notNull().default('{}'),
    cogsBehavior: text('cogs_behavior').notNull().default('disabled'), // disabled | perpetual | periodic
    fiscalSettings: jsonb('fiscal_settings').notNull().default('{}'),
    validationStatus: text('validation_status').notNull().default('incomplete'), // incomplete | valid | invalid
    validationErrors: jsonb('validation_errors').notNull().default('[]'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check('chk_btat_cogs_behavior', sql`cogs_behavior IN ('disabled', 'perpetual', 'periodic')`),
    check('chk_btat_validation_status', sql`validation_status IN ('incomplete', 'valid', 'invalid')`),
  ],
);

// ── Business Type Role Templates ────────────────────────────────
// Role definitions per version
export const businessTypeRoleTemplates = pgTable(
  'business_type_role_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    businessTypeVersionId: text('business_type_version_id')
      .notNull()
      .references(() => businessTypeVersions.id),
    roleName: text('role_name').notNull(),
    roleKey: text('role_key').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_btrt_version_role_key').on(table.businessTypeVersionId, table.roleKey),
  ],
);

// ── Business Type Role Permissions ──────────────────────────────
// Permission grants per role template
export const businessTypeRolePermissions = pgTable(
  'business_type_role_permissions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    roleTemplateId: text('role_template_id')
      .notNull()
      .references(() => businessTypeRoleTemplates.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_btrp_role_permission').on(table.roleTemplateId, table.permissionKey),
  ],
);

// ── Tenant Provisioning Runs ────────────────────────────────────
// Per-tenant provisioning record
export const tenantProvisioningRuns = pgTable(
  'tenant_provisioning_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    businessTypeId: text('business_type_id')
      .notNull()
      .references(() => businessTypes.id),
    businessTypeVersionId: text('business_type_version_id')
      .notNull()
      .references(() => businessTypeVersions.id),
    status: text('status').notNull().default('pending'), // pending | running | success | partial | failed
    snapshotJson: jsonb('snapshot_json').notNull().default('{}'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: text('created_by'),
    errorSummary: text('error_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tpr_tenant').on(table.tenantId),
    index('idx_tpr_business_type').on(table.businessTypeId),
    check(
      'chk_tpr_status',
      sql`status IN ('pending', 'running', 'success', 'partial', 'failed')`,
    ),
  ],
);

// ── Tenant Provisioning Run Steps ───────────────────────────────
// Domain-by-domain step results
export const tenantProvisioningRunSteps = pgTable(
  'tenant_provisioning_run_steps',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    provisioningRunId: text('provisioning_run_id')
      .notNull()
      .references(() => tenantProvisioningRuns.id),
    domainKey: text('domain_key').notNull(), // modules | accounting | user_roles
    status: text('status').notNull().default('pending'), // pending | running | success | partial | failed
    detailsJson: jsonb('details_json').notNull().default('{}'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tprs_run_domain').on(table.provisioningRunId, table.domainKey),
    index('idx_tprs_run').on(table.provisioningRunId),
    check(
      'chk_tprs_status',
      sql`status IN ('pending', 'running', 'success', 'partial', 'failed')`,
    ),
  ],
);
