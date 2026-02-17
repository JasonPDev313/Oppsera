import { DrizzleAuditLogger } from './audit-logger';

export interface AuditEntry {
  tenantId: string;
  locationId?: string;
  actorUserId?: string;
  actorType?: 'user' | 'system' | 'api_key';
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
  query(
    tenantId: string,
    filters: {
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      action?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ entries: (AuditEntry & { id: string; createdAt: string })[]; cursor?: string }>;
}

// ── Singleton ────────────────────────────────────────────────────

let _auditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new DrizzleAuditLogger();
  }
  return _auditLogger;
}

export function setAuditLogger(logger: AuditLogger): void {
  _auditLogger = logger;
}

// ── Re-exports ───────────────────────────────────────────────────

export { DrizzleAuditLogger } from './audit-logger';
export { auditLog, auditLogSystem } from './helpers';
export { computeChanges } from './diff';
export { pruneAuditLog } from './retention';
