/**
 * PMS-specific audit logging helper.
 * Writes to pms_audit_log for PMS module actions.
 * PII values (guest name, email, phone) are redacted in diffJson.
 */
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsAuditLog } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

const PII_FIELDS = new Set(['firstName', 'lastName', 'email', 'phone']);

/**
 * Normalizes diff values: if a value is a plain primitive, wrap it as { before: null, after: value }.
 * If already in { before, after } shape, leave it as-is.
 */
function normalizeDiff(
  diff: Record<string, unknown> | undefined,
): Record<string, { before: unknown; after: unknown }> | undefined {
  if (!diff) return diff;
  const result: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, value] of Object.entries(diff)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      'before' in value &&
      'after' in value
    ) {
      result[key] = value as { before: unknown; after: unknown };
    } else {
      result[key] = { before: null, after: value };
    }
  }
  return result;
}

function redactPii(
  diff: Record<string, { before: unknown; after: unknown }> | undefined,
): Record<string, { before: unknown; after: unknown }> | undefined {
  if (!diff) return diff;
  const result: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, value] of Object.entries(diff)) {
    if (PII_FIELDS.has(key)) {
      result[key] = { before: '[REDACTED]', after: '[REDACTED]' };
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function pmsAuditLogEntry(
  tx: any,
  ctx: RequestContext,
  propertyId: string,
  entityType: string,
  entityId: string,
  action: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  await tx.insert(pmsAuditLog).values({
    id: generateUlid(),
    tenantId: ctx.tenantId,
    propertyId,
    entityType,
    entityId,
    action,
    diffJson: redactPii(normalizeDiff(diff)),
    actorId: ctx.user.id,
    correlationId: ctx.requestId,
  });
}
