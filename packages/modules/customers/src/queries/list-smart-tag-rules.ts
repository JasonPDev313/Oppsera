import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { smartTagRules, tags } from '@oppsera/db';

export interface ListSmartTagRulesInput {
  tenantId: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface SmartTagRuleListItem {
  id: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  name: string;
  description: string | null;
  isActive: boolean;
  evaluationMode: string;
  customersMatched: number;
  customersAdded: number;
  customersRemoved: number;
  lastEvaluatedAt: Date | null;
  lastEvaluationDurationMs: number | null;
  version: number;
  createdAt: Date;
}

export interface ListSmartTagRulesResult {
  items: SmartTagRuleListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listSmartTagRules(
  input: ListSmartTagRulesInput,
): Promise<ListSmartTagRulesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(smartTagRules.tenantId, input.tenantId)];

    if (input.isActive !== undefined) {
      conditions.push(eq(smartTagRules.isActive, input.isActive));
    }

    if (input.cursor) {
      conditions.push(sql`${smartTagRules.id} < ${input.cursor}`);
    }

    const rows = await (tx as any)
      .select({
        id: smartTagRules.id,
        tagId: smartTagRules.tagId,
        tagName: tags.name,
        tagColor: tags.color,
        name: smartTagRules.name,
        description: smartTagRules.description,
        isActive: smartTagRules.isActive,
        evaluationMode: smartTagRules.evaluationMode,
        customersMatched: smartTagRules.customersMatched,
        customersAdded: smartTagRules.customersAdded,
        customersRemoved: smartTagRules.customersRemoved,
        lastEvaluatedAt: smartTagRules.lastEvaluatedAt,
        lastEvaluationDurationMs: smartTagRules.lastEvaluationDurationMs,
        version: smartTagRules.version,
        createdAt: smartTagRules.createdAt,
      })
      .from(smartTagRules)
      .innerJoin(tags, eq(smartTagRules.tagId, tags.id))
      .where(and(...conditions))
      .orderBy(desc(smartTagRules.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return {
      items: items.map((r: any) => ({
        id: r.id,
        tagId: r.tagId,
        tagName: r.tagName,
        tagColor: r.tagColor,
        name: r.name,
        description: r.description ?? null,
        isActive: r.isActive,
        evaluationMode: r.evaluationMode,
        customersMatched: r.customersMatched,
        customersAdded: r.customersAdded,
        customersRemoved: r.customersRemoved,
        lastEvaluatedAt: r.lastEvaluatedAt ?? null,
        lastEvaluationDurationMs: r.lastEvaluationDurationMs ?? null,
        version: r.version,
        createdAt: r.createdAt,
      })),
      cursor: nextCursor,
      hasMore,
    };
  });
}
