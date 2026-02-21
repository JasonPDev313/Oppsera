import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListPaymentSessionsInput } from '../validation';

export interface PaymentSessionListItem {
  id: string;
  tabId: string;
  orderId: string;
  status: string;
  splitStrategy: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  completedAt: string | null;
  createdAt: string;
}

export async function listPaymentSessions(
  input: ListPaymentSessionsInput,
): Promise<PaymentSessionListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`tab_id = ${input.tabId}`,
    ];

    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, split_strategy,
                 total_amount_cents, paid_amount_cents, remaining_amount_cents,
                 completed_at, created_at
          FROM fnb_payment_sessions
          WHERE ${whereClause}
          ORDER BY created_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      tabId: r.tab_id as string,
      orderId: r.order_id as string,
      status: r.status as string,
      splitStrategy: (r.split_strategy as string) ?? null,
      totalAmountCents: Number(r.total_amount_cents),
      paidAmountCents: Number(r.paid_amount_cents),
      remainingAmountCents: Number(r.remaining_amount_cents),
      completedAt: (r.completed_at as string) ?? null,
      createdAt: r.created_at as string,
    }));
  });
}
