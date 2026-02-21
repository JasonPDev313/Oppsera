import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { ServerCheckoutNotFoundError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { ServerCheckedOutPayload } from '../events/types';

interface CompleteServerCheckoutS10Input {
  checkoutId: string;
  cashTipsDeclaredCents: number;
  cashOwedToHouseCents: number;
  signature?: string;
}

export async function completeServerCheckoutS10(ctx: RequestContext, input: CompleteServerCheckoutS10Input) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const checkoutRows = await tx.execute(
      sql`SELECT id, close_batch_id, server_user_id, business_date, status,
                 total_sales_cents, cash_collected_cents, credit_tips_cents
          FROM fnb_server_checkouts
          WHERE id = ${input.checkoutId} AND tenant_id = ${ctx.tenantId}`,
    );
    const checkouts = Array.from(checkoutRows as Iterable<Record<string, unknown>>);
    if (checkouts.length === 0) throw new ServerCheckoutNotFoundError(input.checkoutId);

    const checkout = checkouts[0]!;
    if (checkout.status === 'completed') {
      return { result: checkout, events: [] };
    }

    const rows = await tx.execute(
      sql`UPDATE fnb_server_checkouts
          SET status = 'completed',
              cash_tips_declared_cents = ${input.cashTipsDeclaredCents},
              cash_owed_to_house_cents = ${input.cashOwedToHouseCents},
              signature = ${input.signature ?? null},
              completed_at = NOW(),
              completed_by = ${ctx.user.id},
              updated_at = NOW()
          WHERE id = ${input.checkoutId}
          RETURNING id, close_batch_id, server_user_id, business_date, status,
                    total_sales_cents, cash_collected_cents, credit_tips_cents,
                    cash_tips_declared_cents, cash_owed_to_house_cents`,
    );
    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Fetch batch location for the event payload
    const batchRows = await tx.execute(
      sql`SELECT location_id FROM fnb_close_batches WHERE id = ${updated.close_batch_id as string}`,
    );
    const batch = Array.from(batchRows as Iterable<Record<string, unknown>>)[0]!;

    const payload: ServerCheckedOutPayload = {
      checkoutId: updated.id as string,
      closeBatchId: updated.close_batch_id as string,
      serverUserId: updated.server_user_id as string,
      locationId: batch.location_id as string,
      businessDate: updated.business_date as string,
      totalSalesCents: Number(updated.total_sales_cents),
      cashOwedToHouseCents: input.cashOwedToHouseCents,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.SERVER_CHECKED_OUT, payload as unknown as Record<string, unknown>);

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'fnb.server_checkout.completed', 'server_checkout', (result as Record<string, unknown>).id as string);
  return result;
}
