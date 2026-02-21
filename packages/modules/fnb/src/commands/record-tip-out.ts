import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TipOutRecordedPayload } from '../events/types';

interface RecordTipOutInput {
  clientRequestId?: string;
  fromServerUserId: string;
  toEmployeeId: string;
  toRoleName?: string;
  businessDate: string;
  amountCents: number;
  calculationMethod: string;
  calculationBasis?: string;
}

export async function recordTipOut(
  ctx: RequestContext,
  locationId: string,
  input: RecordTipOutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'recordTipOut');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_out_entries (tenant_id, from_server_user_id, to_employee_id,
            to_role_name, business_date, amount_cents, calculation_method, calculation_basis)
          VALUES (${ctx.tenantId}, ${input.fromServerUserId}, ${input.toEmployeeId},
            ${input.toRoleName ?? null}, ${input.businessDate}, ${input.amountCents},
            ${input.calculationMethod}, ${input.calculationBasis ?? null})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const payload: TipOutRecordedPayload = {
      tipOutId: created.id as string,
      fromServerUserId: input.fromServerUserId,
      toEmployeeId: input.toEmployeeId,
      locationId,
      businessDate: input.businessDate,
      amountCents: input.amountCents,
      calculationMethod: input.calculationMethod,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TIP_OUT_RECORDED, payload as unknown as Record<string, unknown>);

    const tipOutResult = {
      id: created.id as string,
      fromServerUserId: input.fromServerUserId,
      toEmployeeId: input.toEmployeeId,
      businessDate: input.businessDate,
      amountCents: input.amountCents,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recordTipOut', tipOutResult);
    }

    return { result: tipOutResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tip.tip_out_recorded', 'fnb_tip_out_entries', result.id);
  return result;
}
