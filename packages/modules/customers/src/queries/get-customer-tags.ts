import { eq, and, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tags, customerTags } from '@oppsera/db';

export interface GetCustomerTagsInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerTagEntry {
  id: string;
  tagId: string;
  tagName: string;
  tagSlug: string;
  tagColor: string;
  tagIcon: string | null;
  tagType: string;
  source: string;
  sourceRuleId: string | null;
  evidence: unknown;
  appliedAt: Date;
  appliedBy: string;
  expiresAt: Date | null;
}

export async function getCustomerTags(
  input: GetCustomerTagsInput,
): Promise<CustomerTagEntry[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await (tx as any)
      .select({
        id: customerTags.id,
        tagId: customerTags.tagId,
        tagName: tags.name,
        tagSlug: tags.slug,
        tagColor: tags.color,
        tagIcon: tags.icon,
        tagType: tags.tagType,
        source: customerTags.source,
        sourceRuleId: customerTags.sourceRuleId,
        evidence: customerTags.evidence,
        appliedAt: customerTags.appliedAt,
        appliedBy: customerTags.appliedBy,
        expiresAt: customerTags.expiresAt,
      })
      .from(customerTags)
      .innerJoin(tags, eq(customerTags.tagId, tags.id))
      .where(
        and(
          eq(customerTags.tenantId, input.tenantId),
          eq(customerTags.customerId, input.customerId),
          isNull(customerTags.removedAt),
        ),
      );

    return rows.map((r: any) => ({
      id: r.id,
      tagId: r.tagId,
      tagName: r.tagName,
      tagSlug: r.tagSlug,
      tagColor: r.tagColor,
      tagIcon: r.tagIcon ?? null,
      tagType: r.tagType,
      source: r.source,
      sourceRuleId: r.sourceRuleId ?? null,
      evidence: r.evidence ?? null,
      appliedAt: r.appliedAt,
      appliedBy: r.appliedBy,
      expiresAt: r.expiresAt ?? null,
    }));
  });
}
