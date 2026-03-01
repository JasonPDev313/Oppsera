import { eq, and, lt, desc } from 'drizzle-orm';
import {
  withTenant,
  spaCommissionLedger,
  spaProviders,
} from '@oppsera/db';

export interface ListCommissionLedgerInput {
  tenantId: string;
  providerId?: string;
  status?: string;
  payPeriod?: string;
  appointmentId?: string;
  cursor?: string;
  limit?: number;
}

export interface CommissionLedgerRow {
  id: string;
  providerId: string;
  providerName: string | null;
  appointmentId: string | null;
  ruleId: string;
  commissionType: string;
  baseAmountCents: number;
  commissionAmountCents: number;
  rateApplied: number | null;
  status: string;
  payPeriod: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface ListCommissionLedgerResult {
  items: CommissionLedgerRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List commission ledger entries with filters and cursor pagination.
 * LEFT JOINs spaProviders for provider display name.
 * Order by createdAt DESC.
 */
export async function listCommissionLedger(
  input: ListCommissionLedgerInput,
): Promise<ListCommissionLedgerResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaCommissionLedger.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaCommissionLedger.id, input.cursor));
    }

    if (input.providerId) {
      conditions.push(eq(spaCommissionLedger.providerId, input.providerId));
    }

    if (input.status) {
      conditions.push(eq(spaCommissionLedger.status, input.status));
    }

    if (input.payPeriod) {
      conditions.push(eq(spaCommissionLedger.payPeriod, input.payPeriod));
    }

    if (input.appointmentId) {
      conditions.push(eq(spaCommissionLedger.appointmentId, input.appointmentId));
    }

    const rows = await tx
      .select({
        id: spaCommissionLedger.id,
        providerId: spaCommissionLedger.providerId,
        providerName: spaProviders.displayName,
        appointmentId: spaCommissionLedger.appointmentId,
        ruleId: spaCommissionLedger.ruleId,
        commissionType: spaCommissionLedger.commissionType,
        baseAmountCents: spaCommissionLedger.baseAmountCents,
        commissionAmountCents: spaCommissionLedger.commissionAmountCents,
        rateApplied: spaCommissionLedger.rateApplied,
        status: spaCommissionLedger.status,
        payPeriod: spaCommissionLedger.payPeriod,
        approvedBy: spaCommissionLedger.approvedBy,
        approvedAt: spaCommissionLedger.approvedAt,
        paidAt: spaCommissionLedger.paidAt,
        createdAt: spaCommissionLedger.createdAt,
      })
      .from(spaCommissionLedger)
      .leftJoin(spaProviders, eq(spaCommissionLedger.providerId, spaProviders.id))
      .where(and(...conditions))
      .orderBy(desc(spaCommissionLedger.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const items: CommissionLedgerRow[] = sliced.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      providerName: r.providerName ?? null,
      appointmentId: r.appointmentId ?? null,
      ruleId: r.ruleId,
      commissionType: r.commissionType,
      baseAmountCents: r.baseAmountCents,
      commissionAmountCents: r.commissionAmountCents,
      rateApplied: r.rateApplied != null ? Number(r.rateApplied) : null,
      status: r.status,
      payPeriod: r.payPeriod ?? null,
      approvedBy: r.approvedBy ?? null,
      approvedAt: r.approvedAt ?? null,
      paidAt: r.paidAt ?? null,
      createdAt: r.createdAt,
    }));

    return {
      items,
      cursor: hasMore ? sliced[sliced.length - 1]!.id : null,
      hasMore,
    };
  });
}
