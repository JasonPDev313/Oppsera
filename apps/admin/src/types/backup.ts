// ── Frontend Backup Types ────────────────────────────────────────

export interface Backup {
  id: string;
  type: 'manual' | 'scheduled' | 'pre_restore';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  label: string | null;
  tableCount: number | null;
  rowCount: number | null;
  sizeBytes: number | null;
  checksum: string | null;
  retentionTag: string | null;
  expiresAt: string | null;
  storageDriver: string;
  storagePath: string | null;
  initiatedByAdminId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupStats {
  totalBackups: number;
  completedBackups: number;
  failedBackups: number;
  inProgressBackups: number;
  totalSizeBytes: number;
  lastBackupAt: string | null;
  nextScheduledAt: string | null;
  schedulingEnabled: boolean;
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

export interface RestoreOperation {
  id: string;
  backupId: string;
  status: 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'failed' | 'rejected';
  safetyBackupId: string | null;
  requestedByAdminId: string;
  approvedByAdminId: string | null;
  rejectedByAdminId: string | null;
  rejectionReason: string | null;
  confirmationPhrase: string | null;
  tablesRestored: number | null;
  rowsRestored: number | null;
  errorMessage: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  backup: {
    label: string | null;
    type: string | null;
    tableCount: number | null;
    rowCount: number | null;
  };
}
