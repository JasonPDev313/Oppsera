import { eq, and, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tags, smartTagRules } from '@oppsera/db';

export interface GetTagInput {
  tenantId: string;
  tagId: string;
}

export interface TagDetail {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  tagType: string;
  category: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  customerCount: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  archivedAt: Date | null;
  archivedBy: string | null;
  archivedReason: string | null;
  rule: {
    id: string;
    name: string;
    isActive: boolean;
    evaluationMode: string;
    lastEvaluatedAt: Date | null;
    customersMatched: number;
  } | null;
}

export async function getTag(input: GetTagInput): Promise<TagDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [tag] = await (tx as any)
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.tenantId, input.tenantId),
          eq(tags.id, input.tagId),
        ),
      )
      .limit(1);

    if (!tag) return null;

    let rule: TagDetail['rule'] = null;
    if (tag.tagType === 'smart') {
      const [ruleRow] = await (tx as any)
        .select({
          id: smartTagRules.id,
          name: smartTagRules.name,
          isActive: smartTagRules.isActive,
          evaluationMode: smartTagRules.evaluationMode,
          lastEvaluatedAt: smartTagRules.lastEvaluatedAt,
          customersMatched: smartTagRules.customersMatched,
        })
        .from(smartTagRules)
        .where(
          and(
            eq(smartTagRules.tenantId, input.tenantId),
            eq(smartTagRules.tagId, input.tagId),
          ),
        )
        .limit(1);

      rule = ruleRow ?? null;
    }

    return {
      id: tag.id,
      tenantId: tag.tenantId,
      name: tag.name,
      slug: tag.slug,
      description: tag.description ?? null,
      color: tag.color,
      icon: tag.icon ?? null,
      tagType: tag.tagType,
      category: tag.category ?? null,
      isActive: tag.isActive,
      isSystem: tag.isSystem,
      displayOrder: tag.displayOrder,
      customerCount: tag.customerCount,
      metadata: tag.metadata ?? null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      createdBy: tag.createdBy,
      archivedAt: tag.archivedAt ?? null,
      archivedBy: tag.archivedBy ?? null,
      archivedReason: tag.archivedReason ?? null,
      rule,
    };
  });
}
