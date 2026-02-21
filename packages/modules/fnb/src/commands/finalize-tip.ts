import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TipFinalizedPayload } from '../events/types';
import { TabNotFoundError, TipAlreadyFinalizedError } from '../errors';

interface FinalizeTipInput {
  clientRequestId?: string;
  tabId: string;
}

export async function finalizeTip(
  ctx: RequestContext,
  locationId: string,
  input: FinalizeTipInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'finalizeTip');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate tab exists
    const tabs = await tx.execute(
      sql`SELECT id FROM fnb_tabs WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    // Check if already finalized
    const existingFinal = await tx.execute(
      sql`SELECT COUNT(*) as cnt FROM fnb_tip_adjustments
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND is_final = true`,
    );
    const finalRows = Array.from(existingFinal as Iterable<Record<string, unknown>>);
    if (Number(finalRows[0]!.cnt) > 0) {
      throw new TipAlreadyFinalizedError(input.tabId);
    }

    // Finalize all unfinalised adjustments for this tab
    const updated = await tx.execute(
      sql`UPDATE fnb_tip_adjustments
          SET is_final = true, finalized_at = NOW()
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND is_final = false
          RETURNING id, adjusted_tip_cents`,
    );
    const updatedRows = Array.from(updated as Iterable<Record<string, unknown>>);

    // Finalize pre-auths that are in captured/adjusted status
    await tx.execute(
      sql`UPDATE fnb_tab_preauths
          SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND status IN ('captured', 'adjusted')`,
    );

    const totalFinalizedTipCents = updatedRows.reduce(
      (sum, r) => sum + Number(r.adjusted_tip_cents), 0,
    );

    const payload: TipFinalizedPayload = {
      tabId: input.tabId,
      locationId,
      adjustmentCount: updatedRows.length,
      totalFinalizedTipCents,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TIP_FINALIZED, payload as unknown as Record<string, unknown>);

    const finalizeResult = {
      tabId: input.tabId,
      adjustmentCount: updatedRows.length,
      totalFinalizedTipCents,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'finalizeTip', finalizeResult);
    }

    return { result: finalizeResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.preauth.tip_finalized', 'fnb_tabs', input.tabId);
  return result;
}
