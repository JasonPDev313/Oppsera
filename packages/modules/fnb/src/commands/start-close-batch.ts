import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { FNB_EVENTS } from '../events/types';
import type { CloseBatchStartedPayload } from '../events/types';

interface StartCloseBatchInput {
  locationId: string;
  businessDate: string;
  startingFloatCents: number;
  clientRequestId?: string;
}

export async function startCloseBatch(ctx: RequestContext, input: StartCloseBatchInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for existing batch on this date+location
    const existing = await tx.execute(
      sql`SELECT id, status FROM fnb_close_batches
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${input.locationId}
            AND business_date = ${input.businessDate}`,
    );
    const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingRows.length > 0) {
      return { result: existingRows[0] as { id: string; status: string }, events: [] };
    }

    const rows = await tx.execute(
      sql`INSERT INTO fnb_close_batches (tenant_id, location_id, business_date, status, started_at, started_by)
          VALUES (${ctx.tenantId}, ${input.locationId}, ${input.businessDate}, 'open', NOW(), ${ctx.user.id})
          RETURNING id, tenant_id, location_id, business_date, status, started_at, started_by`,
    );
    const batch = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Create the summary row with starting float
    await tx.execute(
      sql`INSERT INTO fnb_close_batch_summaries (tenant_id, close_batch_id, cash_starting_float_cents, tender_breakdown)
          VALUES (${ctx.tenantId}, ${batch.id as string}, ${input.startingFloatCents}, ${JSON.stringify([])})`,
    );

    const payload: CloseBatchStartedPayload = {
      closeBatchId: batch.id as string,
      locationId: input.locationId,
      businessDate: input.businessDate,
      startedBy: ctx.user.id,
      startingFloatCents: input.startingFloatCents,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.CLOSE_BATCH_STARTED, payload as unknown as Record<string, unknown>);

    return { result: batch, events: [event] };
  });

  await auditLog(ctx, 'fnb.close_batch.started', 'close_batch', (result as Record<string, unknown>).id as string);
  return result;
}
