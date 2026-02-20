import { eq, and, lt, ilike, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { floorPlanTemplatesV2 } from '../schema';

export interface ListTemplatesInput {
  tenantId: string;
  category?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface TemplateListRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  widthFt: string;
  heightFt: string;
  objectCount: number;
  totalCapacity: number;
  isSystemTemplate: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface ListTemplatesResult {
  items: TemplateListRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listTemplates(input: ListTemplatesInput): Promise<ListTemplatesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(floorPlanTemplatesV2.tenantId, input.tenantId),
      eq(floorPlanTemplatesV2.isActive, true),
    ];

    if (input.category) {
      conditions.push(eq(floorPlanTemplatesV2.category, input.category));
    }

    if (input.search) {
      conditions.push(ilike(floorPlanTemplatesV2.name, `%${input.search}%`));
    }

    if (input.cursor) {
      conditions.push(lt(floorPlanTemplatesV2.id, input.cursor));
    }

    // Include system templates (tenantId filter via RLS already scoped, system templates have special handling)
    const rows = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(and(...conditions))
      .orderBy(desc(floorPlanTemplatesV2.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: TemplateListRow[] = (hasMore ? rows.slice(0, limit) : rows).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      widthFt: t.widthFt,
      heightFt: t.heightFt,
      objectCount: t.objectCount,
      totalCapacity: t.totalCapacity,
      isSystemTemplate: t.isSystemTemplate,
      thumbnailUrl: t.thumbnailUrl,
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
