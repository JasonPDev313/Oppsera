import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';

interface RecordCashPaidOutInput {
  locationId: string;
  amountCents: number;
  reason: string;
  employeeId: string;
  businessDate: string;
  closeBatchId?: string;
  vendorName?: string;
  approvedBy?: string;
}

export async function recordCashPaidOut(ctx: RequestContext, input: RecordCashPaidOutInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`INSERT INTO fnb_cash_paid_outs (
            tenant_id, location_id, close_batch_id, amount_cents,
            reason, vendor_name, employee_id, approved_by, business_date
          )
          VALUES (
            ${ctx.tenantId}, ${input.locationId}, ${input.closeBatchId ?? null},
            ${input.amountCents}, ${input.reason}, ${input.vendorName ?? null},
            ${input.employeeId}, ${input.approvedBy ?? null}, ${input.businessDate}
          )
          RETURNING id, location_id, close_batch_id, amount_cents,
                    reason, vendor_name, employee_id, approved_by, business_date`,
    );
    const paidOut = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return { result: paidOut, events: [] };
  });

  await auditLog(ctx, 'fnb.cash_paid_out.recorded', 'cash_paid_out', (result as Record<string, unknown>).id as string);
  return result;
}
