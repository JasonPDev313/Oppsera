import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { smartTagEvaluations } from '@oppsera/db';

export interface GetSmartTagEvaluationHistoryInput {
  tenantId: string;
  ruleId: string;
  cursor?: string;
  limit?: number;
}

export interface SmartTagEvaluationEntry {
  id: string;
  ruleId: string;
  triggerType: string;
  triggerEventId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  customersEvaluated: number;
  tagsApplied: number;
  tagsRemoved: number;
  tagsUnchanged: number;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
}

export interface GetSmartTagEvaluationHistoryResult {
  items: SmartTagEvaluationEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getSmartTagEvaluationHistory(
  input: GetSmartTagEvaluationHistoryInput,
): Promise<GetSmartTagEvaluationHistoryResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(smartTagEvaluations.tenantId, input.tenantId),
      eq(smartTagEvaluations.ruleId, input.ruleId),
    ];

    if (input.cursor) {
      conditions.push(sql`${smartTagEvaluations.id} < ${input.cursor}`);
    }

    const rows = await (tx as any)
      .select({
        id: smartTagEvaluations.id,
        ruleId: smartTagEvaluations.ruleId,
        triggerType: smartTagEvaluations.triggerType,
        triggerEventId: smartTagEvaluations.triggerEventId,
        startedAt: smartTagEvaluations.startedAt,
        completedAt: smartTagEvaluations.completedAt,
        status: smartTagEvaluations.status,
        customersEvaluated: smartTagEvaluations.customersEvaluated,
        tagsApplied: smartTagEvaluations.tagsApplied,
        tagsRemoved: smartTagEvaluations.tagsRemoved,
        tagsUnchanged: smartTagEvaluations.tagsUnchanged,
        errorMessage: smartTagEvaluations.errorMessage,
        durationMs: smartTagEvaluations.durationMs,
        metadata: smartTagEvaluations.metadata,
      })
      .from(smartTagEvaluations)
      .where(and(...conditions))
      .orderBy(desc(smartTagEvaluations.startedAt), desc(smartTagEvaluations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return {
      items: items.map((r: any) => ({
        id: r.id,
        ruleId: r.ruleId,
        triggerType: r.triggerType,
        triggerEventId: r.triggerEventId ?? null,
        startedAt: r.startedAt,
        completedAt: r.completedAt ?? null,
        status: r.status,
        customersEvaluated: r.customersEvaluated,
        tagsApplied: r.tagsApplied,
        tagsRemoved: r.tagsRemoved,
        tagsUnchanged: r.tagsUnchanged,
        errorMessage: r.errorMessage ?? null,
        durationMs: r.durationMs ?? null,
        metadata: r.metadata ?? null,
      })),
      cursor: nextCursor,
      hasMore,
    };
  });
}
