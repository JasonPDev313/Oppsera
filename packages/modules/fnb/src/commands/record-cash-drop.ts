import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';

interface RecordCashDropInput {
  locationId: string;
  amountCents: number;
  employeeId: string;
  businessDate: string;
  closeBatchId?: string;
  terminalId?: string;
  notes?: string;
  clientRequestId?: string;
}

export async function recordCashDrop(ctx: RequestContext, input: RecordCashDropInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'recordCashDrop');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const rows = await tx.execute(
      sql`INSERT INTO fnb_cash_drops (
            tenant_id, location_id, close_batch_id, amount_cents,
            employee_id, terminal_id, business_date, notes
          )
          VALUES (
            ${ctx.tenantId}, ${input.locationId}, ${input.closeBatchId ?? null},
            ${input.amountCents}, ${input.employeeId}, ${input.terminalId ?? null},
            ${input.businessDate}, ${input.notes ?? null}
          )
          RETURNING id, location_id, close_batch_id, amount_cents,
                    employee_id, terminal_id, business_date, notes`,
    );
    const drop = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recordCashDrop', drop);

    return { result: drop, events: [] };
  });

  await auditLog(ctx, 'fnb.cash_drop.recorded', 'cash_drop', (result as Record<string, unknown>).id as string);
  return result;
}
