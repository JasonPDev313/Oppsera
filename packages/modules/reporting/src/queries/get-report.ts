import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant, reportDefinitions } from '@oppsera/db';

export interface ReportRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  dataset: string;
  definition: unknown;
  createdBy: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListReportsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface ListReportsResult {
  items: ReportRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getReport(tenantId: string, reportId: string): Promise<ReportRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await (tx as any).select().from(reportDefinitions)
      .where(and(
        eq(reportDefinitions.id, reportId),
        eq(reportDefinitions.tenantId, tenantId),
        eq(reportDefinitions.isArchived, false),
      ))
      .limit(1);
    return row ? mapRow(row) : null;
  });
}

export async function listReports(input: ListReportsInput): Promise<ListReportsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(reportDefinitions.tenantId, input.tenantId),
      eq(reportDefinitions.isArchived, false),
    ];
    if (input.cursor) {
      conditions.push(lt(reportDefinitions.id, input.cursor));
    }

    const rows = await (tx as any).select().from(reportDefinitions)
      .where(and(...conditions))
      .orderBy(desc(reportDefinitions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapRow),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

function mapRow(r: typeof reportDefinitions.$inferSelect): ReportRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    description: r.description ?? null,
    dataset: r.dataset,
    definition: r.definition,
    createdBy: r.createdBy,
    isArchived: r.isArchived,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
