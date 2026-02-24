import { withTenant } from '@oppsera/db';
import { paymentIntents, achReturns } from '@oppsera/db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────

export interface AchStatusSummary {
  pendingCount: number;
  pendingAmountCents: number;
  originatedCount: number;
  originatedAmountCents: number;
  settledCount: number;
  settledAmountCents: number;
  returnedCount: number;
  returnedAmountCents: number;
}

export interface AchPendingItem {
  id: string;
  amountCents: number;
  customerId: string | null;
  orderId: string | null;
  achSecCode: string | null;
  bankLast4: string | null;
  achSettlementStatus: string;
  createdAt: string;
}

export interface AchReturnItem {
  id: string;
  paymentIntentId: string;
  returnCode: string;
  returnReason: string;
  returnDate: string;
  originalAmountCents: number;
  isAdministrative: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AchReturnCodeDistribution {
  returnCode: string;
  returnReason: string;
  count: number;
}

export interface AchSettlementByDate {
  date: string;
  settledCount: number;
  settledAmountCents: number;
  returnedCount: number;
  returnedAmountCents: number;
}

export interface GetAchStatusInput {
  tenantId: string;
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
}

// ── Summary Query ──────────────────────────────────────────────

export async function getAchStatusSummary(
  input: GetAchStatusInput,
): Promise<AchStatusSummary> {
  const { tenantId, locationId } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(paymentIntents.tenantId, tenantId),
      eq(paymentIntents.paymentMethodType, 'ach'),
    ];
    if (locationId) {
      conditions.push(eq(paymentIntents.locationId, locationId));
    }

    const rows = await tx.execute(sql`
      SELECT
        ach_settlement_status,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount_cents), 0)::int AS total_cents
      FROM payment_intents
      WHERE tenant_id = ${tenantId}
        AND payment_method_type = 'ach'
        AND ach_settlement_status IS NOT NULL
        ${locationId ? sql`AND location_id = ${locationId}` : sql``}
      GROUP BY ach_settlement_status
    `);

    const result: AchStatusSummary = {
      pendingCount: 0,
      pendingAmountCents: 0,
      originatedCount: 0,
      originatedAmountCents: 0,
      settledCount: 0,
      settledAmountCents: 0,
      returnedCount: 0,
      returnedAmountCents: 0,
    };

    for (const row of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const status = String(row.ach_settlement_status);
      const count = Number(row.count);
      const totalCents = Number(row.total_cents);

      switch (status) {
        case 'pending':
          result.pendingCount = count;
          result.pendingAmountCents = totalCents;
          break;
        case 'originated':
          result.originatedCount = count;
          result.originatedAmountCents = totalCents;
          break;
        case 'settled':
          result.settledCount = count;
          result.settledAmountCents = totalCents;
          break;
        case 'returned':
          result.returnedCount = count;
          result.returnedAmountCents = totalCents;
          break;
      }
    }

    return result;
  });
}

// ── Pending/In-Transit List ────────────────────────────────────

export async function listAchPending(
  input: GetAchStatusInput & { cursor?: string; limit?: number },
): Promise<{ items: AchPendingItem[]; cursor: string | null; hasMore: boolean }> {
  const { tenantId, locationId } = input;
  const limit = input.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        id,
        amount_cents,
        customer_id,
        order_id,
        ach_sec_code,
        bank_last4,
        ach_settlement_status,
        created_at
      FROM payment_intents
      WHERE tenant_id = ${tenantId}
        AND payment_method_type = 'ach'
        AND ach_settlement_status IN ('pending', 'originated')
        ${locationId ? sql`AND location_id = ${locationId}` : sql``}
        ${input.cursor ? sql`AND id < ${input.cursor}` : sql``}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;

    return {
      items: sliced.map((r) => ({
        id: String(r.id),
        amountCents: Number(r.amount_cents),
        customerId: r.customer_id ? String(r.customer_id) : null,
        orderId: r.order_id ? String(r.order_id) : null,
        achSecCode: r.ach_sec_code ? String(r.ach_sec_code) : null,
        bankLast4: r.bank_last4 ? String(r.bank_last4) : null,
        achSettlementStatus: String(r.ach_settlement_status),
        createdAt: String(r.created_at),
      })),
      cursor: hasMore && sliced.length > 0 ? String(sliced[sliced.length - 1]!.id) : null,
      hasMore,
    };
  });
}

// ── Returns List ───────────────────────────────────────────────

export async function listAchReturns(
  input: GetAchStatusInput & { cursor?: string; limit?: number },
): Promise<{ items: AchReturnItem[]; cursor: string | null; hasMore: boolean }> {
  const { tenantId, dateFrom, dateTo } = input;
  const limit = input.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        id,
        payment_intent_id,
        return_code,
        return_reason,
        return_date,
        original_amount_cents,
        is_administrative,
        resolved_at,
        created_at
      FROM ach_returns
      WHERE tenant_id = ${tenantId}
        ${dateFrom ? sql`AND return_date >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND return_date <= ${dateTo}` : sql``}
        ${input.cursor ? sql`AND id < ${input.cursor}` : sql``}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;

    return {
      items: sliced.map((r) => ({
        id: String(r.id),
        paymentIntentId: String(r.payment_intent_id),
        returnCode: String(r.return_code),
        returnReason: String(r.return_reason),
        returnDate: String(r.return_date),
        originalAmountCents: Number(r.original_amount_cents),
        isAdministrative: Boolean(r.is_administrative),
        resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
        createdAt: String(r.created_at),
      })),
      cursor: hasMore && sliced.length > 0 ? String(sliced[sliced.length - 1]!.id) : null,
      hasMore,
    };
  });
}

// ── Return Code Distribution ───────────────────────────────────

export async function getAchReturnDistribution(
  input: GetAchStatusInput,
): Promise<AchReturnCodeDistribution[]> {
  const { tenantId, dateFrom, dateTo } = input;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        return_code,
        return_reason,
        COUNT(*)::int AS count
      FROM ach_returns
      WHERE tenant_id = ${tenantId}
        ${dateFrom ? sql`AND return_date >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND return_date <= ${dateTo}` : sql``}
      GROUP BY return_code, return_reason
      ORDER BY count DESC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      returnCode: String(r.return_code),
      returnReason: String(r.return_reason),
      count: Number(r.count),
    }));
  });
}

// ── Settlement Summary by Date ─────────────────────────────────

export async function getAchSettlementByDate(
  input: GetAchStatusInput,
): Promise<AchSettlementByDate[]> {
  const { tenantId, dateFrom, dateTo, locationId } = input;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COALESCE(ach_settled_at::date, created_at::date)::text AS date,
        COUNT(*) FILTER (WHERE ach_settlement_status = 'settled')::int AS settled_count,
        COALESCE(SUM(amount_cents) FILTER (WHERE ach_settlement_status = 'settled'), 0)::int AS settled_amount_cents,
        COUNT(*) FILTER (WHERE ach_settlement_status = 'returned')::int AS returned_count,
        COALESCE(SUM(amount_cents) FILTER (WHERE ach_settlement_status = 'returned'), 0)::int AS returned_amount_cents
      FROM payment_intents
      WHERE tenant_id = ${tenantId}
        AND payment_method_type = 'ach'
        AND ach_settlement_status IN ('settled', 'returned')
        ${locationId ? sql`AND location_id = ${locationId}` : sql``}
        ${dateFrom ? sql`AND COALESCE(ach_settled_at::date, created_at::date) >= ${dateFrom}::date` : sql``}
        ${dateTo ? sql`AND COALESCE(ach_settled_at::date, created_at::date) <= ${dateTo}::date` : sql``}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 90
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      date: String(r.date),
      settledCount: Number(r.settled_count),
      settledAmountCents: Number(r.settled_amount_cents),
      returnedCount: Number(r.returned_count),
      returnedAmountCents: Number(r.returned_amount_cents),
    }));
  });
}
