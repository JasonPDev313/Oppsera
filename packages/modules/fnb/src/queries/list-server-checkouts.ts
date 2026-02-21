import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListServerCheckoutsInput } from '../validation';

export interface ServerCheckoutItem {
  id: string;
  closeBatchId: string;
  serverUserId: string;
  businessDate: string;
  status: string;
  totalSalesCents: number;
  cashCollectedCents: number;
  creditTipsCents: number;
  cashTipsDeclaredCents: number;
  tipOutPaidCents: number;
  cashOwedToHouseCents: number;
  openTabCount: number;
  completedAt: string | null;
  completedBy: string | null;
}

export async function listServerCheckouts(
  input: ListServerCheckoutsInput,
): Promise<ServerCheckoutItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`close_batch_id = ${input.closeBatchId}`,
    ];

    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, close_batch_id, server_user_id, business_date, status,
                 total_sales_cents, cash_collected_cents, credit_tips_cents,
                 cash_tips_declared_cents, tip_out_paid_cents, cash_owed_to_house_cents,
                 open_tab_count, completed_at, completed_by
          FROM fnb_server_checkouts
          WHERE ${whereClause}
          ORDER BY created_at ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      closeBatchId: r.close_batch_id as string,
      serverUserId: r.server_user_id as string,
      businessDate: r.business_date as string,
      status: r.status as string,
      totalSalesCents: Number(r.total_sales_cents),
      cashCollectedCents: Number(r.cash_collected_cents),
      creditTipsCents: Number(r.credit_tips_cents),
      cashTipsDeclaredCents: Number(r.cash_tips_declared_cents),
      tipOutPaidCents: Number(r.tip_out_paid_cents),
      cashOwedToHouseCents: Number(r.cash_owed_to_house_cents),
      openTabCount: Number(r.open_tab_count),
      completedAt: (r.completed_at as string) ?? null,
      completedBy: (r.completed_by as string) ?? null,
    }));
  });
}
