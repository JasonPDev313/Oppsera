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

// ── Storage ─────────────────────────────────────────────────────

export interface BackupStorage {
  write(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
