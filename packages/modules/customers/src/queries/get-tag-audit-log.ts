import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tagAuditLog, tags } from '@oppsera/db';

export interface GetTagAuditLogInput {
  tenantId: string;
  tagId?: string;
  customerId?: string;
  action?: string;
  cursor?: string;
  limit?: number;
}

export interface TagAuditLogEntry {
  id: string;
  customerId: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  action: string;
  source: string;
  sourceRuleId: string | null;
  actorId: string;
  evidence: Record<string, unknown> | null;
  occurredAt: Date;
}

export interface GetTagAuditLogResult {
  items: TagAuditLogEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getTagAuditLog(
  input: GetTagAuditLogInput,
): Promise<GetTagAuditLogResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(tagAuditLog.tenantId, input.tenantId)];

    if (input.tagId) {
      conditions.push(eq(tagAuditLog.tagId, input.tagId));
    }

    if (input.customerId) {
      conditions.push(eq(tagAuditLog.customerId, input.customerId));
    }

    if (input.action) {
      conditions.push(eq(tagAuditLog.action, input.action));
    }

    if (input.cursor) {
      conditions.push(sql`${tagAuditLog.id} < ${input.cursor}`);
    }

    const rows = await (tx as any)
      .select({
        id: tagAuditLog.id,
        customerId: tagAuditLog.customerId,
        tagId: tagAuditLog.tagId,
        tagName: tags.name,
        tagColor: tags.color,
        action: tagAuditLog.action,
        source: tagAuditLog.source,
        sourceRuleId: tagAuditLog.sourceRuleId,
        actorId: tagAuditLog.actorId,
        evidence: tagAuditLog.evidence,
        occurredAt: tagAuditLog.occurredAt,
      })
      .from(tagAuditLog)
      .innerJoin(tags, eq(tagAuditLog.tagId, tags.id))
      .where(and(...conditions))
      .orderBy(desc(tagAuditLog.occurredAt), desc(tagAuditLog.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return {
      items: items.map((r: any) => ({
        id: r.id,
        customerId: r.customerId,
        tagId: r.tagId,
        tagName: r.tagName,
        tagColor: r.tagColor,
        action: r.action,
        source: r.source,
        sourceRuleId: r.sourceRuleId ?? null,
        actorId: r.actorId,
        evidence: r.evidence ?? null,
        occurredAt: r.occurredAt,
      })),
      cursor: nextCursor,
      hasMore,
    };
  });
}
