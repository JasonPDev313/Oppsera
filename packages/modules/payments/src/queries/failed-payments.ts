import { withTenant } from '@oppsera/db';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc, lt, gte, sql } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────

export interface FailedPaymentItem {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  paymentMethodType: string;
  cardLast4: string | null;
  cardBrand: string | null;
  customerId: string | null;
  orderId: string | null;
  locationId: string;
  errorMessage: string | null;
  attemptCount: number;
  latestResponseText: string | null;
  originalIntentId: string | null;
  // ── Response enrichment fields ──
  declineCategory: string | null;
  userMessage: string | null;
  suggestedAction: string | null;
  retryable: boolean;
  avsResult: string | null;
  cvvResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FailedPaymentListResult {
  items: FailedPaymentItem[];
  cursor: string | null;
  hasMore: boolean;
}

export interface FailedPaymentCounts {
  total: number;
  declined: number;
  error: number;
}

export interface ListFailedPaymentsInput {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
}

// ── Queries ───────────────────────────────────────────────────

export async function listFailedPayments(
  tenantId: string,
  input: ListFailedPaymentsInput = {},
): Promise<FailedPaymentListResult> {
  const limit = input.limit ?? 25;

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(paymentIntents.tenantId, tenantId),
      sql`${paymentIntents.status} IN ('declined', 'error')`,
    ];

    // Default to last 30 days
    if (input.dateFrom) {
      conditions.push(gte(paymentIntents.createdAt, new Date(input.dateFrom)));
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(gte(paymentIntents.createdAt, thirtyDaysAgo));
    }

    if (input.dateTo) {
      const endDate = new Date(input.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lt(paymentIntents.createdAt, endDate));
    }

    if (input.customerId) {
      conditions.push(eq(paymentIntents.customerId, input.customerId));
    }
    if (input.locationId) {
      conditions.push(eq(paymentIntents.locationId, input.locationId));
    }
    if (input.cursor) {
      conditions.push(lt(paymentIntents.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(paymentIntents)
      .where(and(...conditions))
      .orderBy(desc(paymentIntents.createdAt), desc(paymentIntents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Enrich with transaction attempt counts and latest response text
    const intentIds = items.map((r) => r.id);
    const attemptMap = new Map<string, {
      count: number;
      responseText: string | null;
      declineCategory: string | null;
      userMessage: string | null;
      suggestedAction: string | null;
      retryable: boolean;
      avsResult: string | null;
      cvvResult: string | null;
    }>();

    if (intentIds.length > 0) {
      const txnRows = await tx
        .select({
          paymentIntentId: paymentTransactions.paymentIntentId,
          responseText: paymentTransactions.responseText,
          createdAt: paymentTransactions.createdAt,
          declineCategory: paymentTransactions.declineCategory,
          userMessage: paymentTransactions.userMessage,
          suggestedAction: paymentTransactions.suggestedAction,
          retryable: paymentTransactions.retryable,
          avsResult: paymentTransactions.avsResult,
          cvvResult: paymentTransactions.cvvResult,
        })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, tenantId),
            sql`${paymentTransactions.paymentIntentId} IN (${sql.join(
              intentIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(desc(paymentTransactions.createdAt));

      for (const row of txnRows) {
        const existing = attemptMap.get(row.paymentIntentId);
        if (existing) {
          existing.count += 1;
        } else {
          attemptMap.set(row.paymentIntentId, {
            count: 1,
            responseText: row.responseText,
            declineCategory: row.declineCategory ?? null,
            userMessage: row.userMessage ?? null,
            suggestedAction: row.suggestedAction ?? null,
            retryable: row.retryable ?? false,
            avsResult: row.avsResult ?? null,
            cvvResult: row.cvvResult ?? null,
          });
        }
      }
    }

    // Check for retry references in metadata
    return {
      items: items.map((r) => {
        const attempts = attemptMap.get(r.id);
        const meta = r.metadata as Record<string, unknown> | null;
        return {
          id: r.id,
          status: r.status,
          amountCents: r.amountCents,
          currency: r.currency,
          paymentMethodType: r.paymentMethodType,
          cardLast4: r.cardLast4 ?? null,
          cardBrand: r.cardBrand ?? null,
          customerId: r.customerId ?? null,
          orderId: r.orderId ?? null,
          locationId: r.locationId,
          errorMessage: r.errorMessage ?? null,
          attemptCount: attempts?.count ?? 0,
          latestResponseText: attempts?.responseText ?? null,
          originalIntentId: (meta?.originalIntentId as string) ?? null,
          declineCategory: attempts?.declineCategory ?? null,
          userMessage: attempts?.userMessage ?? null,
          suggestedAction: attempts?.suggestedAction ?? null,
          retryable: attempts?.retryable ?? false,
          avsResult: attempts?.avsResult ?? null,
          cvvResult: attempts?.cvvResult ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

export async function getFailedPaymentCounts(
  tenantId: string,
): Promise<FailedPaymentCounts> {
  return withTenant(tenantId, async (tx) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await tx
      .select({
        status: paymentIntents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, tenantId),
          sql`${paymentIntents.status} IN ('declined', 'error')`,
          gte(paymentIntents.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(paymentIntents.status);

    let declined = 0;
    let error = 0;
    for (const row of rows) {
      if (row.status === 'declined') declined = row.count;
      if (row.status === 'error') error = row.count;
    }

    return { total: declined + error, declined, error };
  });
}
