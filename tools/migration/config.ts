/**
 * Migration Pipeline Configuration
 *
 * Controls batch sizes, file paths, and migration behavior.
 * Override via environment variables or CLI args.
 */
import path from 'path';

export interface MigrationConfig {
  /** Directory containing CSV/JSON export files */
  exportDir: string;
  /** PostgreSQL connection string for target database */
  targetDbUrl: string;
  /** Admin connection (bypasses RLS) for migration writes */
  adminDbUrl: string;
  /** Batch size for INSERT operations */
  batchSize: number;
  /** Maximum concurrent domain migrations */
  concurrency: number;
  /** Directory for migration logs and quarantine files */
  outputDir: string;
  /** Enable dry-run mode (validate only, no writes) */
  dryRun: boolean;
  /** Specific tenant IDs to migrate (empty = all) */
  tenantFilter: string[];
  /** Resume from a specific domain (for crash recovery) */
  resumeFrom?: string;
  /** Skip validation after migration */
  skipValidation: boolean;
}

export function loadConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    exportDir: overrides.exportDir ?? process.env.MIGRATION_EXPORT_DIR ?? './exports',
    targetDbUrl: overrides.targetDbUrl ?? process.env.DATABASE_URL ?? '',
    adminDbUrl: overrides.adminDbUrl ?? process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL ?? '',
    batchSize: overrides.batchSize ?? parseInt(process.env.MIGRATION_BATCH_SIZE ?? '500', 10),
    concurrency: overrides.concurrency ?? parseInt(process.env.MIGRATION_CONCURRENCY ?? '3', 10),
    outputDir: overrides.outputDir ?? process.env.MIGRATION_OUTPUT_DIR ?? './migration-output',
    dryRun: overrides.dryRun ?? process.env.MIGRATION_DRY_RUN === 'true',
    tenantFilter: overrides.tenantFilter ?? (process.env.MIGRATION_TENANT_FILTER?.split(',').filter(Boolean) ?? []),
    resumeFrom: overrides.resumeFrom ?? process.env.MIGRATION_RESUME_FROM,
    skipValidation: overrides.skipValidation ?? process.env.MIGRATION_SKIP_VALIDATION === 'true',
  };
}

/** Domain execution order (respects foreign key dependencies) */
export const DOMAIN_ORDER = [
  // Tier 0: No cross-domain dependencies
  'tenants',          // Must be first — everything references tenants
  'locations',        // Referenced by most domain tables
  'users',            // Referenced by many tables (created_by, etc.)
  'management_co',
  'departments',
  'courses',
  'communications',
  'api',
  'portal',
  'floor_plans',
  'venues',
  'misc',

  // Tier 1: Depends on Tier 0
  'customers',        // References locations
  'catalog',          // References locations, categories
  'discounts',        // References departments, courses
  'roles',            // References departments
  'terminals',        // References locations

  // Tier 2: Depends on Tier 0+1
  'memberships',      // References customers, plans
  'inventory',        // References catalog items, locations
  'employees',        // References users, terminals
  'reservations',     // References courses, resources
  'loyalty',          // References customers
  'punch_cards',      // References customers, courses
  'vouchers',         // References customers, departments
  'minimum_spend',    // References customers, departments

  // Tier 3: Depends on Tier 0+1+2
  'orders',           // References customers, catalog, locations
  'tee_times',        // References courses, customers
  'events',           // References courses, venues, customers

  // Tier 4: Depends on Tier 0+1+2+3
  'payments',         // References orders
  'order_gaps',       // References orders
  'payment_gaps',     // References orders, tenders
] as const;

export type DomainName = typeof DOMAIN_ORDER[number];

/** Maps legacy GF_ table names to their domain */
export const TABLE_TO_DOMAIN: Record<string, DomainName> = {
  // Populate at runtime from transformer registry
};

/** Tables to SKIP entirely during migration */
export const SKIP_TABLES = new Set([
  'GF_AuditLog', 'GF_AuditLogArchive', 'GF_AuditLogSyncQueue',
  'GF_ClubIntegration', 'GF_ClubIntegrationPaymentMethod',
  'GF_IntegrationLog', 'GF_IntegrationMapping',
  'GF_Country', 'GF_State', 'GF_City', 'GF_County',
  'GF_Currency', 'GF_TimeZone', 'GF_TimezoneList',
  'GF_TestData', 'GF_SampleOrders',
  'GF_AppBuild', 'GF_AppConfiguration', 'GF_AppVersions',
  'GF_DeviceActivation', 'GF_DeviceRegistration',
  'GF_LSEntities', 'GF_LSItemsAssociations',
  'GF_ChartOfAccountsGreatPlainsExtension', 'GF_ChartOfAccountsOracleExtension',
  'GF_Modules', 'GF_Modules_Group',
  'GF_AIConversation', 'GF_AIMessage', 'GF_AIMessageMetadata',
]);
