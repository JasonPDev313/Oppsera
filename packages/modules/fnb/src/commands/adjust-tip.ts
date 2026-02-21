import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TipAdjustedPayload } from '../events/types';
import { TipAlreadyFinalizedError } from '../errors';

interface AdjustTipInput {
  clientRequestId?: string;
  preauthId?: string;
  tenderId?: string;
  tabId: string;
  originalTipCents: number;
  adjustedTipCents: number;
  adjustmentReason?: string;
}

export async function adjustTip(
  ctx: RequestContext,
  locationId: string,
  input: AdjustTipInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'adjustTip');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Check if tips for this tab are already finalized
    const existingFinal = await tx.execute(
      sql`SELECT COUNT(*) as cnt FROM fnb_tip_adjustments
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND is_final = true`,
    );
    const finalRows = Array.from(existingFinal as Iterable<Record<string, unknown>>);
    if (Number(finalRows[0]!.cnt) > 0) {
      throw new TipAlreadyFinalizedError(input.tabId);
    }

    // Insert tip adjustment
    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_adjustments (tenant_id, tab_id, preauth_id, tender_id,
            original_tip_cents, adjusted_tip_cents, adjustment_reason, adjusted_by)
          VALUES (${ctx.tenantId}, ${input.tabId}, ${input.preauthId ?? null},
            ${input.tenderId ?? null}, ${input.originalTipCents}, ${input.adjustedTipCents},
            ${input.adjustmentReason ?? null}, ${ctx.user.id})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // If pre-auth based, update the pre-auth tip and final amounts
    if (input.preauthId) {
      await tx.execute(
        sql`UPDATE fnb_tab_preauths
            SET tip_amount_cents = ${input.adjustedTipCents},
                final_amount_cents = COALESCE(captured_amount_cents, 0) + ${input.adjustedTipCents},
                status = 'adjusted',
                adjusted_at = NOW(),
                updated_at = NOW()
            WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
      );
    }

    const payload: TipAdjustedPayload = {
      adjustmentId: created.id as string,
      tabId: input.tabId,
      locationId,
      preauthId: input.preauthId ?? null,
      tenderId: input.tenderId ?? null,
      originalTipCents: input.originalTipCents,
      adjustedTipCents: input.adjustedTipCents,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TIP_ADJUSTED, payload as unknown as Record<string, unknown>);

    const adjustResult = {
      id: created.id as string,
      tabId: input.tabId,
      preauthId: input.preauthId ?? null,
      tenderId: input.tenderId ?? null,
      originalTipCents: input.originalTipCents,
      adjustedTipCents: input.adjustedTipCents,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'adjustTip', adjustResult);
    }

    return { result: adjustResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.preauth.tip_adjusted', 'fnb_tip_adjustments', result.id);
  return result;
}
