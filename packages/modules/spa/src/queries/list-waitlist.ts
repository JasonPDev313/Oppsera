import { eq, and, lt, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaWaitlist,
  spaServices,
  spaProviders,
  customers,
} from '@oppsera/db';

function encodeCursor(priority: number, createdAt: Date, id: string): string {
  return `${priority}|${createdAt.toISOString()}|${id}`;
}

function decodeCursor(cursor: string): { priority: number; createdAt: string; id: string } | null {
  const parts = cursor.split('|');
  if (parts.length === 3) {
    const priority = Number(parts[0]);
    if (!isNaN(priority)) {
      return { priority, createdAt: parts[1]!, id: parts[2]! };
    }
  }
  // Backwards compatibility: id-only cursor
  return null;
}

export interface ListWaitlistInput {
  tenantId: string;
  status?: string;
  customerId?: string;
  serviceId?: string;
  providerId?: string;
  cursor?: string;
  limit?: number;
}

export interface WaitlistRow {
  id: string;
  customerId: string | null;
  customerName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  preferredProviderId: string | null;
  providerName: string | null;
  preferredDate: string | null;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  flexibility: string;
  status: string;
  priority: number;
  notes: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ListWaitlistResult {
  items: WaitlistRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List waitlist entries with filtering and cursor pagination.
 * LEFT JOINs customers, services, and providers for display names.
 * Ordered by priority descending (highest first), then createdAt descending.
 */
export async function listWaitlist(
  input: ListWaitlistInput,
): Promise<ListWaitlistResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaWaitlist.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (decoded) {
        // Composite cursor for (priority DESC, createdAt DESC, id DESC):
        // all columns are DESC so row-value comparison works:
        // (priority, createdAt, id) < (cursorPriority, cursorCreatedAt, cursorId)
        conditions.push(
          sql`(${spaWaitlist.priority}, ${spaWaitlist.createdAt}, ${spaWaitlist.id}) < (${decoded.priority}, ${decoded.createdAt}::timestamptz, ${decoded.id})`,
        );
      } else {
        // Backwards-compatible id-only cursor
        conditions.push(lt(spaWaitlist.id, input.cursor));
      }
    }

    if (input.status) {
      conditions.push(eq(spaWaitlist.status, input.status));
    }

    if (input.customerId) {
      conditions.push(eq(spaWaitlist.customerId, input.customerId));
    }

    if (input.serviceId) {
      conditions.push(eq(spaWaitlist.serviceId, input.serviceId));
    }

    if (input.providerId) {
      conditions.push(eq(spaWaitlist.preferredProviderId, input.providerId));
    }

    const rows = await tx
      .select({
        id: spaWaitlist.id,
        customerId: spaWaitlist.customerId,
        customerName: customers.displayName,
        serviceId: spaWaitlist.serviceId,
        serviceName: spaServices.name,
        preferredProviderId: spaWaitlist.preferredProviderId,
        providerName: spaProviders.displayName,
        preferredDate: spaWaitlist.preferredDate,
        preferredTimeStart: spaWaitlist.preferredTimeStart,
        preferredTimeEnd: spaWaitlist.preferredTimeEnd,
        flexibility: spaWaitlist.flexibility,
        status: spaWaitlist.status,
        priority: spaWaitlist.priority,
        notes: spaWaitlist.notes,
        expiresAt: spaWaitlist.expiresAt,
        createdAt: spaWaitlist.createdAt,
      })
      .from(spaWaitlist)
      .leftJoin(customers, eq(spaWaitlist.customerId, customers.id))
      .leftJoin(spaServices, eq(spaWaitlist.serviceId, spaServices.id))
      .leftJoin(spaProviders, eq(spaWaitlist.preferredProviderId, spaProviders.id))
      .where(and(...conditions))
      .orderBy(desc(spaWaitlist.priority), desc(spaWaitlist.createdAt), desc(spaWaitlist.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    if (sliced.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    const items: WaitlistRow[] = sliced.map((r) => ({
      id: r.id,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
      serviceId: r.serviceId ?? null,
      serviceName: r.serviceName ?? null,
      preferredProviderId: r.preferredProviderId ?? null,
      providerName: r.providerName ?? null,
      preferredDate: r.preferredDate ?? null,
      preferredTimeStart: r.preferredTimeStart ?? null,
      preferredTimeEnd: r.preferredTimeEnd ?? null,
      flexibility: r.flexibility,
      status: r.status,
      priority: r.priority,
      notes: r.notes ?? null,
      expiresAt: r.expiresAt ?? null,
      createdAt: r.createdAt,
    }));

    const last = sliced[sliced.length - 1]!;
    return {
      items,
      cursor: hasMore ? encodeCursor(last.priority, last.createdAt, last.id) : null,
      hasMore,
    };
  });
}
