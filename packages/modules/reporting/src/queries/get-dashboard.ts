import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant, dashboardDefinitions } from '@oppsera/db';

export interface DashboardRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  tiles: unknown;
  isDefault: boolean;
  createdBy: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDashboardsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface ListDashboardsResult {
  items: DashboardRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getDashboard(tenantId: string, dashboardId: string): Promise<DashboardRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await (tx as any).select().from(dashboardDefinitions)
      .where(and(
        eq(dashboardDefinitions.id, dashboardId),
        eq(dashboardDefinitions.tenantId, tenantId),
        eq(dashboardDefinitions.isArchived, false),
      ))
      .limit(1);
    return row ? mapRow(row) : null;
  });
}

export async function listDashboards(input: ListDashboardsInput): Promise<ListDashboardsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(dashboardDefinitions.tenantId, input.tenantId),
      eq(dashboardDefinitions.isArchived, false),
    ];
    if (input.cursor) {
      conditions.push(lt(dashboardDefinitions.id, input.cursor));
    }

    const rows = await (tx as any).select().from(dashboardDefinitions)
      .where(and(...conditions))
      .orderBy(desc(dashboardDefinitions.id))
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

function mapRow(r: typeof dashboardDefinitions.$inferSelect): DashboardRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    description: r.description ?? null,
    tiles: r.tiles,
    isDefault: r.isDefault,
    createdBy: r.createdBy,
    isArchived: r.isArchived,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
