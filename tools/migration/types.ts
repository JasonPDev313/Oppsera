/**
 * Migration Pipeline Type Definitions
 */

/** Result of processing a single row */
export interface TransformResult<T = Record<string, unknown>> {
  /** Transformed row ready for INSERT */
  row: T;
  /** Legacy ID for the id-map */
  legacyId: string | number;
  /** New ULID assigned to this row */
  newId: string;
}

/** Result of processing a batch */
export interface BatchResult {
  domain: string;
  table: string;
  attempted: number;
  inserted: number;
  skipped: number;
  quarantined: number;
  errors: MigrationError[];
  durationMs: number;
}

/** A row that failed cleaning/validation and was quarantined */
export interface QuarantineRecord {
  domain: string;
  sourceTable: string;
  targetTable: string;
  legacyId: string | number;
  tenantId: string;
  reason: string;
  rawData: Record<string, unknown>;
  timestamp: Date;
}

/** A migration error */
export interface MigrationError {
  domain: string;
  sourceTable: string;
  targetTable: string;
  legacyId?: string | number;
  tenantId?: string;
  message: string;
  stack?: string;
  timestamp: Date;
}

/** Migration progress tracker */
export interface MigrationProgress {
  tenantId: string;
  domain: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  totalRows: number;
  processedRows: number;
  insertedRows: number;
  skippedRows: number;
  quarantinedRows: number;
  errorCount: number;
  startedAt?: Date;
  completedAt?: Date;
  checkpointAt?: Date;
}

/** Tenant mapping from legacy ClubId to new tenant_id */
export interface TenantMapping {
  legacyClubId: number;
  newTenantId: string;
  tenantName: string;
  locationMappings: LocationMapping[];
}

/** Location mapping from legacy CourseId to new location_id */
export interface LocationMapping {
  legacyCourseId: number;
  newLocationId: string;
  locationName: string;
}

/** ID mapping entry stored in the database */
export interface IdMapEntry {
  legacyTable: string;
  legacyId: string;
  newTable: string;
  newId: string;
  tenantId: string;
}

/** CSV/JSON export file descriptor */
export interface ExportFile {
  tableName: string;
  filePath: string;
  format: 'csv' | 'json';
  rowCount?: number;
  encoding?: string;
}

/** Column transformation rule */
export interface ColumnTransform {
  sourceColumn: string;
  targetColumn: string;
  transform: 'direct' | 'money_to_cents' | 'bit_to_bool' | 'datetime_to_timestamptz' | 'id_lookup' | 'custom';
  lookupTable?: string;
  customFn?: (value: unknown, row: Record<string, unknown>) => unknown;
  nullable?: boolean;
  defaultValue?: unknown;
}

/** Domain transformer definition */
export interface DomainTransformerDef {
  domain: string;
  tables: TableTransformerDef[];
}

/** Table-level transformer */
export interface TableTransformerDef {
  sourceTable: string;
  targetTable: string;
  /** Filter: skip rows where IsDeleted = 1 */
  skipDeleted?: boolean;
  /** Column name containing the deleted flag */
  deletedColumn?: string;
  columns: ColumnTransform[];
  /** Custom row-level validation */
  validate?: (row: Record<string, unknown>) => string | null;
  /** Tables this depends on (for ordering) */
  dependsOn?: string[];
}

/** Validation check result */
export interface ValidationResult {
  check: string;
  domain: string;
  table: string;
  passed: boolean;
  expected: number | string;
  actual: number | string;
  details?: string;
}

/** Migration run summary */
export interface MigrationSummary {
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'rolled_back';
  config: {
    dryRun: boolean;
    tenantFilter: string[];
    batchSize: number;
  };
  tenants: {
    tenantId: string;
    tenantName: string;
    domains: MigrationProgress[];
  }[];
  totals: {
    totalRows: number;
    insertedRows: number;
    skippedRows: number;
    quarantinedRows: number;
    errorCount: number;
  };
  validationResults: ValidationResult[];
}
