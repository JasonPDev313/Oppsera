import { eq, and, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaCommissionRules,
  spaProviders,
  spaServices,
} from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

export interface ListCommissionRulesInput {
  tenantId: string;
  providerId?: string;
  isActive?: boolean;
  appliesTo?: string;
  cursor?: string;
  limit?: number;
}

export interface CommissionRuleRow {
  id: string;
  name: string;
  providerId: string | null;
  providerName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceCategory: string | null;
  commissionType: string;
  rate: number | null;
  flatAmount: number | null;
  appliesTo: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  priority: number;
  createdAt: Date;
}

export interface ListCommissionRulesResult {
  items: CommissionRuleRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List commission rules with filters and cursor pagination.
 * LEFT JOINs spaProviders and spaServices for display names.
 * Order by priority DESC, createdAt DESC, id DESC.
 */
export async function listCommissionRules(
  input: ListCommissionRulesInput,
): Promise<ListCommissionRulesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaCommissionRules.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor, 3);
      if (decoded) {
        const [cursorPriority, cursorCreatedAt, cursorId] = decoded as [string, string, string];
        // All three sorts are DESC — row-value comparison works
        conditions.push(
          sql`(${spaCommissionRules.priority}, ${spaCommissionRules.createdAt}, ${spaCommissionRules.id}) < (${parseInt(cursorPriority, 10)}, ${cursorCreatedAt}::timestamptz, ${cursorId})` as unknown as ReturnType<typeof eq>,
        );
      } else {
        // Legacy: cursor was plain id
        conditions.push(
          sql`${spaCommissionRules.id} < ${input.cursor}` as unknown as ReturnType<typeof eq>,
        );
      }
    }

    if (input.providerId !== undefined) {
      conditions.push(eq(spaCommissionRules.providerId, input.providerId));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(spaCommissionRules.isActive, input.isActive));
    }

    if (input.appliesTo) {
      conditions.push(eq(spaCommissionRules.appliesTo, input.appliesTo));
    }

    const rows = await tx
      .select({
        id: spaCommissionRules.id,
        name: spaCommissionRules.name,
        providerId: spaCommissionRules.providerId,
        providerName: spaProviders.displayName,
        serviceId: spaCommissionRules.serviceId,
        serviceName: spaServices.name,
        serviceCategory: spaCommissionRules.serviceCategory,
        commissionType: spaCommissionRules.commissionType,
        rate: spaCommissionRules.rate,
        flatAmount: spaCommissionRules.flatAmount,
        appliesTo: spaCommissionRules.appliesTo,
        effectiveFrom: spaCommissionRules.effectiveFrom,
        effectiveUntil: spaCommissionRules.effectiveUntil,
        isActive: spaCommissionRules.isActive,
        priority: spaCommissionRules.priority,
        createdAt: spaCommissionRules.createdAt,
      })
      .from(spaCommissionRules)
      .leftJoin(spaProviders, eq(spaCommissionRules.providerId, spaProviders.id))
      .leftJoin(spaServices, eq(spaCommissionRules.serviceId, spaServices.id))
      .where(and(...conditions))
      .orderBy(desc(spaCommissionRules.priority), desc(spaCommissionRules.createdAt), desc(spaCommissionRules.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const items: CommissionRuleRow[] = sliced.map((r) => ({
      id: r.id,
      name: r.name,
      providerId: r.providerId ?? null,
      providerName: r.providerName ?? null,
      serviceId: r.serviceId ?? null,
      serviceName: r.serviceName ?? null,
      serviceCategory: r.serviceCategory ?? null,
      commissionType: r.commissionType,
      rate: r.rate != null ? Number(r.rate) : null,
      flatAmount: r.flatAmount != null ? Number(r.flatAmount) : null,
      appliesTo: r.appliesTo,
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil ?? null,
      isActive: r.isActive,
      priority: r.priority,
      createdAt: r.createdAt,
    }));

    const lastItem = sliced[sliced.length - 1];
    return {
      items,
      cursor: hasMore && lastItem
        ? encodeCursor(String(lastItem.priority), lastItem.createdAt.toISOString(), lastItem.id)
        : null,
      hasMore,
    };
  });
}
