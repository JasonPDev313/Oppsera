import type { RequestContext } from '../auth/context';
import { deferWork } from '../auth/context';
import { getAuditLogger } from './index';

/**
 * Log an audit entry using the current request context.
 * This is the primary way to audit-log from route handlers and commands.
 */
export async function auditLog(
  ctx: RequestContext,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action,
    entityType,
    entityId,
    changes,
    metadata: {
      requestId: ctx.requestId,
      ...metadata,
    },
  });
}

/**
 * Deferred variant of auditLog — enqueues the audit write to run AFTER the
 * HTTP response is sent (via next/server after()). Use this in commands that
 * call auditLog after publishWithOutbox to avoid blocking the response with
 * an extra DB round-trip.
 */
export function auditLogDeferred(
  ctx: RequestContext,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
  metadata?: Record<string, unknown>,
): void {
  deferWork(ctx, () => auditLog(ctx, action, entityType, entityId, changes, metadata));
}

/**
 * Log an audit entry for a system-initiated action (no user context).
 * Used by event consumers and background workers.
 */
export async function auditLogSystem(
  tenantId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const logger = getAuditLogger();
  await logger.log({
    tenantId,
    actorType: 'system',
    action,
    entityType,
    entityId,
    metadata,
  });
}
