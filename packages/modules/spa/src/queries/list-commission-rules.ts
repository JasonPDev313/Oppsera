import { eq, and, lt, desc } from 'drizzle-orm';
import {
  withTenant,
  spaCommissionRules,
  spaProviders,
  spaServices,
} from '@oppsera/db';

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
 * Order by priority DESC, then createdAt DESC.
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
      conditions.push(lt(spaCommissionRules.id, input.cursor));
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
      .orderBy(desc(spaCommissionRules.priority), desc(spaCommissionRules.createdAt))
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

    return {
      items,
      cursor: hasMore ? sliced[sliced.length - 1]!.id : null,
      hasMore,
    };
  });
}
