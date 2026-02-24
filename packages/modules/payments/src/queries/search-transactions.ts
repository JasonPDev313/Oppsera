import { withTenant, paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, gte, lte, desc, lt, sql } from 'drizzle-orm';
import type { SearchTransactionsInput } from '../gateway-validation';

export interface TransactionListItem {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
  refundedAmountCents: number | null;
  paymentMethodType: string;
  cardLast4: string | null;
  cardBrand: string | null;
  customerId: string | null;
  orderId: string | null;
  locationId: string;
  providerRef: string | null;
  errorMessage: string | null;
  // ACH-specific fields
  achSettlementStatus: string | null;
  achSecCode: string | null;
  achReturnCode: string | null;
  bankLast4: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListResult {
  items: TransactionListItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Search payment intents with filters, cursor pagination.
 */
export async function searchTransactions(
  tenantId: string,
  input: SearchTransactionsInput,
): Promise<TransactionListResult> {
  const limit = input.limit ?? 25;

  return withTenant(tenantId, async (tx) => {
    // Build dynamic conditions
    const conditions = [eq(paymentIntents.tenantId, tenantId)];

    if (input.status) {
      conditions.push(eq(paymentIntents.status, input.status));
    }

    if (input.paymentMethodType) {
      conditions.push(eq(paymentIntents.paymentMethodType, input.paymentMethodType));
    }

    if (input.dateFrom) {
      conditions.push(gte(paymentIntents.createdAt, new Date(input.dateFrom)));
    }
    if (input.dateTo) {
      // Include the entire end date
      const endDate = new Date(input.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lt(paymentIntents.createdAt, endDate));
    }

    if (input.amountMinCents !== undefined) {
      conditions.push(gte(paymentIntents.amountCents, input.amountMinCents));
    }
    if (input.amountMaxCents !== undefined) {
      conditions.push(lte(paymentIntents.amountCents, input.amountMaxCents));
    }

    if (input.cardLast4) {
      conditions.push(eq(paymentIntents.cardLast4, input.cardLast4));
    }

    if (input.customerId) {
      conditions.push(eq(paymentIntents.customerId, input.customerId));
    }

    if (input.orderId) {
      conditions.push(eq(paymentIntents.orderId, input.orderId));
    }

    if (input.locationId) {
      conditions.push(eq(paymentIntents.locationId, input.locationId));
    }

    if (input.cursor) {
      conditions.push(lt(paymentIntents.id, input.cursor));
    }

    // Query intents
    const rows = await tx
      .select()
      .from(paymentIntents)
      .where(and(...conditions))
      .orderBy(desc(paymentIntents.createdAt), desc(paymentIntents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Get latest provider ref for each intent
    const intentIds = items.map((r) => r.id);
    const providerRefs: Map<string, string> = new Map();

    if (intentIds.length > 0) {
      const txnRows = await tx
        .select({
          paymentIntentId: paymentTransactions.paymentIntentId,
          providerRef: paymentTransactions.providerRef,
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

      // First encountered per intent is the latest
      for (const row of txnRows) {
        if (!providerRefs.has(row.paymentIntentId)) {
          providerRefs.set(row.paymentIntentId, row.providerRef ?? '');
        }
      }
    }

    return {
      items: items.map((r) => ({
        id: r.id,
        status: r.status,
        amountCents: r.amountCents,
        currency: r.currency,
        authorizedAmountCents: r.authorizedAmountCents,
        capturedAmountCents: r.capturedAmountCents,
        refundedAmountCents: r.refundedAmountCents,
        paymentMethodType: r.paymentMethodType,
        cardLast4: r.cardLast4,
        cardBrand: r.cardBrand,
        customerId: r.customerId,
        orderId: r.orderId,
        locationId: r.locationId,
        providerRef: providerRefs.get(r.id) ?? null,
        errorMessage: r.errorMessage,
        achSettlementStatus: r.achSettlementStatus ?? null,
        achSecCode: r.achSecCode ?? null,
        achReturnCode: r.achReturnCode ?? null,
        bankLast4: r.bankLast4 ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

export interface TransactionDetail extends TransactionListItem {
  providerId: string;
  merchantAccountId: string;
  tenderId: string | null;
  token: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  transactions: TransactionRecord[];
}

export interface TransactionRecord {
  id: string;
  transactionType: string;
  providerRef: string | null;
  authCode: string | null;
  amountCents: number;
  responseStatus: string;
  responseCode: string | null;
  responseText: string | null;
  avsResponse: string | null;
  cvvResponse: string | null;
  createdAt: string;
}

/**
 * Get full payment intent detail with all transaction records.
 */
export async function getTransactionDetail(
  tenantId: string,
  intentId: string,
): Promise<TransactionDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, tenantId),
          eq(paymentIntents.id, intentId),
        ),
      )
      .limit(1);

    if (!intent) return null;

    // Get all transaction records
    const txns = await tx
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, tenantId),
          eq(paymentTransactions.paymentIntentId, intentId),
        ),
      )
      .orderBy(paymentTransactions.createdAt);

    const latestRef = txns.length > 0 ? txns[txns.length - 1]!.providerRef : null;

    return {
      id: intent.id,
      status: intent.status,
      amountCents: intent.amountCents,
      currency: intent.currency,
      authorizedAmountCents: intent.authorizedAmountCents,
      capturedAmountCents: intent.capturedAmountCents,
      refundedAmountCents: intent.refundedAmountCents,
      paymentMethodType: intent.paymentMethodType,
      cardLast4: intent.cardLast4,
      cardBrand: intent.cardBrand,
      customerId: intent.customerId,
      orderId: intent.orderId,
      locationId: intent.locationId,
      providerId: intent.providerId,
      merchantAccountId: intent.merchantAccountId,
      tenderId: intent.tenderId,
      token: intent.token,
      idempotencyKey: intent.idempotencyKey,
      metadata: intent.metadata as Record<string, unknown> | null,
      createdBy: intent.createdBy,
      providerRef: latestRef,
      errorMessage: intent.errorMessage,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      transactions: txns.map((t) => ({
        id: t.id,
        transactionType: t.transactionType,
        providerRef: t.providerRef,
        authCode: t.authCode,
        amountCents: t.amountCents,
        responseStatus: t.responseStatus,
        responseCode: t.responseCode,
        responseText: t.responseText,
        avsResponse: t.avsResponse,
        cvvResponse: t.cvvResponse,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });
}
