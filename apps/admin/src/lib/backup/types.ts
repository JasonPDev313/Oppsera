// ── Backup Service Types ─────────────────────────────────────────

export interface TableInfo {
  name: string;
  estimatedRowCount: number;
  estimatedSizeBytes: number;
}

export interface TableManifestEntry {
  name: string;
  rowCount: number;
  columns: string[];
}

export interface BackupManifest {
  version: 1;
  createdAt: string;
  pgVersion: string;
  schemaVersion: string;
  tableCount: number;
  rowCount: number;
  tables: TableManifestEntry[];
}

export interface BackupPayload {
  manifest: BackupManifest;
  data: Record<string, unknown[]>;
}

export interface CreateBackupInput {
  type: 'manual' | 'scheduled' | 'pre_restore';
  label?: string;
  adminId?: string;
  retentionTag?: string | null;
  expiresAt?: Date | null;
}

export interface CreateBackupResult {
  backupId: string;
  tableCount: number;
  rowCount: number;
  sizeBytes: number;
}

export interface RestoreValidation {
  compatible: boolean;
  warnings: string[];
  errors: string[];
}

export interface BackupSettings {
  id: string;
  schedulingEnabled: boolean;
  intervalMinutes: number;
  retentionDailyDays: number;
  retentionWeeklyWeeks: number;
  retentionMonthlyMonths: number;
  storageDriver: string;
  dualApprovalRequired: boolean;
  lastScheduledBackupAt: string | null;
}

// ── Tenant-Scoped Restore ───────────────────────────────────────

export interface TenantRestoreValidation extends RestoreValidation {
  /** Tables in the backup that have a tenant_id column and contain matching rows */
  tenantTables: string[];
  /** Total rows in the backup belonging to the target tenant */
  tenantRowCount: number;
}

// ── Restore Progress ──────────────────────────────────────────

export interface RestoreProgress {
  phase: 'safety_backup' | 'loading' | 'validating' | 'truncating' | 'inserting' | 'sequences' | 'complete';
  /** Current table being processed (during truncating/inserting phases) */
  currentTable?: string;
  /** 1-based index of the current table within the phase */
  tableIndex?: number;
  /** Total tables to process in this phase */
  totalTables?: number;
  /** Total rows inserted so far */
  rowsInserted?: number;
  /** ISO timestamp of last progress update */
  updatedAt: string;
}

// ── Storage ─────────────────────────────────────────────────────

export interface BackupStorage {
  write(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

// ── S3-Compatible Storage Config ────────────────────────────────

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Force path-style URLs (required for Cloudflare R2, MinIO) */
  forcePathStyle?: boolean;
}
