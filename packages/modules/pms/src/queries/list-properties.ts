import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsProperties } from '@oppsera/db';

export interface PropertyListItem {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  addressJson: Record<string, unknown> | null;
  taxRatePct: string;
  checkInTime: string;
  checkOutTime: string;
  nightAuditTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ListPropertiesInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface ListPropertiesResult {
  items: PropertyListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listProperties(input: ListPropertiesInput): Promise<ListPropertiesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(pmsProperties.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(pmsProperties.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(pmsProperties)
      .where(and(...conditions))
      .orderBy(desc(pmsProperties.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        name: r.name,
        timezone: r.timezone,
        currency: r.currency,
        addressJson: r.addressJson ?? null,
        taxRatePct: r.taxRatePct,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        nightAuditTime: r.nightAuditTime,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
