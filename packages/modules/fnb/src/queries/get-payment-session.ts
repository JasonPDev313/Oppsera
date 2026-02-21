import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetPaymentSessionInput } from '../validation';

export interface PaymentSessionDetail {
  id: string;
  tabId: string;
  orderId: string;
  status: string;
  splitStrategy: string | null;
  splitDetails: Record<string, unknown> | null;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  checkPresentedAt: string | null;
  checkPresentedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function getPaymentSession(
  input: GetPaymentSessionInput,
): Promise<PaymentSessionDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, split_strategy, split_details,
                 total_amount_cents, paid_amount_cents, remaining_amount_cents,
                 check_presented_at, check_presented_by, completed_at, created_at
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${input.tenantId}`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      id: r.id as string,
      tabId: r.tab_id as string,
      orderId: r.order_id as string,
      status: r.status as string,
      splitStrategy: (r.split_strategy as string) ?? null,
      splitDetails: (r.split_details as Record<string, unknown>) ?? null,
      totalAmountCents: Number(r.total_amount_cents),
      paidAmountCents: Number(r.paid_amount_cents),
      remainingAmountCents: Number(r.remaining_amount_cents),
      checkPresentedAt: (r.check_presented_at as string) ?? null,
      checkPresentedBy: (r.check_presented_by as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
      createdAt: r.created_at as string,
    };
  });
}
