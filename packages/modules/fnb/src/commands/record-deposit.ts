import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { DepositRecordedPayload } from '../events/types';

interface RecordDepositInput {
  closeBatchId: string;
  locationId: string;
  depositAmountCents: number;
  depositDate: string;
  bankReference?: string;
  notes?: string;
}

export async function recordDeposit(ctx: RequestContext, input: RecordDepositInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate close batch exists
    const batchRows = await tx.execute(
      sql`SELECT id, status FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const rows = await tx.execute(
      sql`INSERT INTO fnb_deposit_slips (
            tenant_id, location_id, close_batch_id, deposit_amount_cents,
            deposit_date, bank_reference, notes
          )
          VALUES (
            ${ctx.tenantId}, ${input.locationId}, ${input.closeBatchId},
            ${input.depositAmountCents}, ${input.depositDate},
            ${input.bankReference ?? null}, ${input.notes ?? null}
          )
          RETURNING id, close_batch_id, location_id, deposit_amount_cents,
                    deposit_date, bank_reference, notes`,
    );
    const deposit = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const payload: DepositRecordedPayload = {
      depositId: deposit.id as string,
      closeBatchId: input.closeBatchId,
      locationId: input.locationId,
      depositAmountCents: input.depositAmountCents,
      depositDate: input.depositDate,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.DEPOSIT_RECORDED, payload as unknown as Record<string, unknown>);

    return { result: deposit, events: [event] };
  });

  await auditLog(ctx, 'fnb.deposit.recorded', 'deposit_slip', (result as Record<string, unknown>).id as string);
  return result;
}
