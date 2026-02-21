import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';

interface BeginServerCheckoutInput {
  closeBatchId: string;
  serverUserId: string;
}

export async function beginServerCheckout(ctx: RequestContext, input: BeginServerCheckoutInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate close batch exists and is open/in_progress
    const batchRows = await tx.execute(
      sql`SELECT id, status, location_id, business_date FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.status !== 'open' && batch.status !== 'in_progress') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'open or in_progress');
    }

    // Check for existing checkout for this server in this batch
    const existingRows = await tx.execute(
      sql`SELECT id FROM fnb_server_checkouts
          WHERE close_batch_id = ${input.closeBatchId}
            AND server_user_id = ${input.serverUserId}
            AND tenant_id = ${ctx.tenantId}`,
    );
    const existingCheckouts = Array.from(existingRows as Iterable<Record<string, unknown>>);
    if (existingCheckouts.length > 0) {
      return { result: existingCheckouts[0]!, events: [] };
    }

    // Count open tabs for this server
    const tabRows = await tx.execute(
      sql`SELECT COUNT(*) as cnt FROM fnb_tabs
          WHERE tenant_id = ${ctx.tenantId}
            AND server_id = ${input.serverUserId}
            AND status IN ('open', 'active')`,
    );
    const tabCount = Number(Array.from(tabRows as Iterable<Record<string, unknown>>)[0]!.cnt);

    // Calculate server's sales and tips for the day
    const salesRows = await tx.execute(
      sql`SELECT COALESCE(SUM(t.total_cents), 0) as total_sales,
                 COALESCE(SUM(CASE WHEN tender.tender_type = 'cash' THEN tender.amount_cents ELSE 0 END), 0) as cash_collected,
                 COALESCE(SUM(CASE WHEN tender.tender_type != 'cash' THEN tender.tip_amount_cents ELSE 0 END), 0) as credit_tips
          FROM fnb_tabs t
          LEFT JOIN fnb_checks c ON c.tab_id = t.id
          LEFT JOIN tenders tender ON tender.order_id = c.order_id AND tender.status = 'completed'
          WHERE t.tenant_id = ${ctx.tenantId}
            AND t.server_id = ${input.serverUserId}
            AND t.business_date = ${batch.business_date as string}`,
    );
    const sales = Array.from(salesRows as Iterable<Record<string, unknown>>)[0]!;

    const rows = await tx.execute(
      sql`INSERT INTO fnb_server_checkouts (
            tenant_id, close_batch_id, server_user_id, business_date, status,
            total_sales_cents, cash_collected_cents, credit_tips_cents, open_tab_count
          )
          VALUES (
            ${ctx.tenantId}, ${input.closeBatchId}, ${input.serverUserId},
            ${batch.business_date as string}, 'pending',
            ${Number(sales.total_sales)}, ${Number(sales.cash_collected)},
            ${Number(sales.credit_tips)}, ${tabCount}
          )
          RETURNING id, close_batch_id, server_user_id, business_date, status,
                    total_sales_cents, cash_collected_cents, credit_tips_cents, open_tab_count`,
    );
    const checkout = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Move batch to in_progress if it was open
    if (batch.status === 'open') {
      await tx.execute(
        sql`UPDATE fnb_close_batches SET status = 'in_progress', updated_at = NOW()
            WHERE id = ${input.closeBatchId}`,
      );
    }

    return { result: checkout, events: [] };
  });

  await auditLog(ctx, 'fnb.server_checkout.started', 'server_checkout', (result as Record<string, unknown>).id as string);
  return result;
}
