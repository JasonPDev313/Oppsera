import { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { platformAdminAuditLog } from '@oppsera/db';
import type { AdminSession } from './auth';

// ── Types ────────────────────────────────────────────────────────

interface AdminAuditInput {
  session: AdminSession;
  action: string;
  entityType: string;
  entityId: string;
  tenantId?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

// ── Audit Logger ─────────────────────────────────────────────────

/**
 * Log an admin action to the platform audit log.
 * Best-effort — never blocks the calling operation.
 */
export async function logAdminAudit(input: AdminAuditInput): Promise<void> {
  try {
    await db.insert(platformAdminAuditLog).values({
      actorAdminId: input.session.adminId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: input.tenantId ?? null,
      beforeSnapshot: input.beforeSnapshot ?? null,
      afterSnapshot: input.afterSnapshot ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    // Best-effort — never block the operation (same pattern as core auditLog)
    console.error('[admin-audit] Failed to log:', error);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Extract client IP from request headers.
 */
export function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

/**
 * Strip sensitive fields from an object before storing in audit snapshot.
 */
export function sanitizeSnapshot(obj: Record<string, unknown>): Record<string, unknown> {
  const {
    passwordHash,
    password_hash,
    inviteTokenHash,
    invite_token_hash,
    ...safe
  } = obj;
  return safe;
}
