import { eq, and, lt, desc, gte, lte } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerAuditLog } from '@oppsera/db';

export interface GetCustomerAuditTrailInput {
  tenantId: string;
  customerId: string;
  actionType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditTrailEntry {
  id: string;
  actorUserId: string;
  actionType: string;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  occurredAt: string;
}

export interface CustomerAuditTrailResult {
  entries: AuditTrailEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerAuditTrail(
  input: GetCustomerAuditTrailInput,
): Promise<CustomerAuditTrailResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(customerAuditLog.tenantId, input.tenantId),
      eq(customerAuditLog.customerId, input.customerId),
    ];

    if (input.actionType) {
      conditions.push(eq(customerAuditLog.actionType, input.actionType));
    }

    if (input.dateFrom) {
      conditions.push(gte(customerAuditLog.occurredAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(customerAuditLog.occurredAt, new Date(input.dateTo)));
    }

    if (input.cursor) {
      conditions.push(lt(customerAuditLog.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: customerAuditLog.id,
        actorUserId: customerAuditLog.actorUserId,
        actionType: customerAuditLog.actionType,
        beforeJson: customerAuditLog.beforeJson,
        afterJson: customerAuditLog.afterJson,
        reason: customerAuditLog.reason,
        occurredAt: customerAuditLog.occurredAt,
      })
      .from(customerAuditLog)
      .where(and(...conditions))
      .orderBy(desc(customerAuditLog.occurredAt), desc(customerAuditLog.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const entries: AuditTrailEntry[] = items.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actionType: row.actionType,
      beforeJson: row.beforeJson ?? null,
      afterJson: row.afterJson ?? null,
      reason: row.reason ?? null,
      occurredAt: row.occurredAt.toISOString(),
    }));

    return { entries, cursor: nextCursor, hasMore };
  });
}
