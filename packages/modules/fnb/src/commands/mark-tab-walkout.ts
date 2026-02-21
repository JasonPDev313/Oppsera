import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TabWalkoutPayload } from '../events/types';
import { TabNotFoundError } from '../errors';

interface MarkTabWalkoutInput {
  clientRequestId?: string;
  tabId: string;
  autoGratuityPercentage?: number;
  reason?: string;
}

export async function markTabWalkout(
  ctx: RequestContext,
  locationId: string,
  input: MarkTabWalkoutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'markTabWalkout');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate tab exists
    const tabs = await tx.execute(
      sql`SELECT id, order_id FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    // Find active pre-auth for this tab
    const preauths = await tx.execute(
      sql`SELECT id, auth_amount_cents, captured_amount_cents
          FROM fnb_tab_preauths
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND status = 'authorized'
          ORDER BY created_at DESC LIMIT 1`,
    );
    const preauthRows = Array.from(preauths as Iterable<Record<string, unknown>>);
    const activePreauth = preauthRows.length > 0 ? preauthRows[0]! : null;

    let capturedAmountCents = 0;

    if (activePreauth) {
      // Capture the pre-auth amount on walkout
      capturedAmountCents = Number(activePreauth.auth_amount_cents);

      const autoTip = input.autoGratuityPercentage
        ? Math.round(capturedAmountCents * input.autoGratuityPercentage / 100)
        : 0;

      await tx.execute(
        sql`UPDATE fnb_tab_preauths
            SET status = 'captured',
                captured_amount_cents = ${capturedAmountCents},
                tip_amount_cents = ${autoTip},
                final_amount_cents = ${capturedAmountCents + autoTip},
                is_walkout = true,
                captured_at = NOW(),
                updated_at = NOW()
            WHERE id = ${activePreauth.id} AND tenant_id = ${ctx.tenantId}`,
      );
    }

    // Mark tab as walkout — update status to closed with walkout flag
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'closed', is_walkout = true, updated_at = NOW()
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: TabWalkoutPayload = {
      tabId: input.tabId,
      locationId,
      preauthId: activePreauth ? (activePreauth.id as string) : null,
      capturedAmountCents,
      autoGratuityPercentage: input.autoGratuityPercentage ?? null,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_WALKOUT, payload as unknown as Record<string, unknown>);

    const walkoutResult = {
      tabId: input.tabId,
      preauthId: activePreauth ? (activePreauth.id as string) : null,
      capturedAmountCents,
      status: 'closed',
      isWalkout: true,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'markTabWalkout', walkoutResult);
    }

    return { result: walkoutResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.walkout', 'fnb_tabs', input.tabId);
  return result;
}
