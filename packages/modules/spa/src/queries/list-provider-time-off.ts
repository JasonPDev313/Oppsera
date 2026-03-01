import { eq, and, gte, lte, desc, lt } from 'drizzle-orm';
import { withTenant, spaProviderTimeOff } from '@oppsera/db';

export interface ListProviderTimeOffInput {
  tenantId: string;
  providerId: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface ProviderTimeOffRow {
  id: string;
  tenantId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  isAllDay: boolean;
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListProviderTimeOffResult {
  items: ProviderTimeOffRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List time-off entries for a provider.
 * Supports optional date range filter, status filter, and cursor pagination.
 */
export async function listProviderTimeOff(
  input: ListProviderTimeOffInput,
): Promise<ListProviderTimeOffResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaProviderTimeOff.tenantId, input.tenantId),
      eq(spaProviderTimeOff.providerId, input.providerId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaProviderTimeOff.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(spaProviderTimeOff.status, input.status));
    }

    // Date range filter: time-off entries that overlap with the given range
    if (input.startDate) {
      // endAt >= startDate (entry ends after range start)
      conditions.push(gte(spaProviderTimeOff.endAt, new Date(input.startDate)));
    }

    if (input.endDate) {
      const rangeEnd = new Date(input.endDate);
      rangeEnd.setHours(23, 59, 59, 999);
      // startAt <= endDate (entry starts before range end)
      conditions.push(lte(spaProviderTimeOff.startAt, rangeEnd));
    }

    const rows = await tx
      .select({
        id: spaProviderTimeOff.id,
        tenantId: spaProviderTimeOff.tenantId,
        providerId: spaProviderTimeOff.providerId,
        startAt: spaProviderTimeOff.startAt,
        endAt: spaProviderTimeOff.endAt,
        reason: spaProviderTimeOff.reason,
        isAllDay: spaProviderTimeOff.isAllDay,
        status: spaProviderTimeOff.status,
        approvedBy: spaProviderTimeOff.approvedBy,
        approvedAt: spaProviderTimeOff.approvedAt,
        createdAt: spaProviderTimeOff.createdAt,
        updatedAt: spaProviderTimeOff.updatedAt,
      })
      .from(spaProviderTimeOff)
      .where(and(...conditions))
      .orderBy(desc(spaProviderTimeOff.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mapped: ProviderTimeOffRow[] = items.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      providerId: row.providerId,
      startAt: row.startAt,
      endAt: row.endAt,
      reason: row.reason ?? null,
      isAllDay: row.isAllDay,
      status: row.status,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return {
      items: mapped,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
