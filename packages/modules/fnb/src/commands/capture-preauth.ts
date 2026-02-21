import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { PreauthCapturedPayload } from '../events/types';
import { PreauthNotFoundError, PreauthStatusConflictError, PreauthAmountExceededError } from '../errors';

const CAPTURE_THRESHOLD_PERCENT = 20; // configurable: max % over auth amount allowed

interface CapturePreauthInput {
  clientRequestId?: string;
  preauthId: string;
  captureAmountCents: number;
  tipAmountCents: number;
  overrideThreshold: boolean;
}

export async function capturePreauth(
  ctx: RequestContext,
  locationId: string,
  input: CapturePreauthInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'capturePreauth');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch pre-auth
    const preauths = await tx.execute(
      sql`SELECT id, tab_id, status, auth_amount_cents, card_token
          FROM fnb_tab_preauths
          WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rows = Array.from(preauths as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PreauthNotFoundError(input.preauthId);

    const preauth = rows[0]!;
    const status = preauth.status as string;

    if (status !== 'authorized') {
      throw new PreauthStatusConflictError(input.preauthId, status, 'capture');
    }

    // Check if capture exceeds auth + threshold
    const authAmount = Number(preauth.auth_amount_cents);
    const totalCapture = input.captureAmountCents + input.tipAmountCents;
    const maxAllowed = Math.round(authAmount * (1 + CAPTURE_THRESHOLD_PERCENT / 100));

    if (totalCapture > maxAllowed && !input.overrideThreshold) {
      throw new PreauthAmountExceededError(input.preauthId, authAmount, totalCapture);
    }

    // Update pre-auth to captured
    await tx.execute(
      sql`UPDATE fnb_tab_preauths
          SET status = 'captured',
              captured_amount_cents = ${input.captureAmountCents},
              tip_amount_cents = ${input.tipAmountCents},
              final_amount_cents = ${totalCapture},
              captured_at = NOW(),
              updated_at = NOW()
          WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: PreauthCapturedPayload = {
      preauthId: input.preauthId,
      tabId: preauth.tab_id as string,
      locationId,
      authAmountCents: authAmount,
      capturedAmountCents: input.captureAmountCents,
      tipAmountCents: input.tipAmountCents,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PREAUTH_CAPTURED, payload as unknown as Record<string, unknown>);

    const captureResult = {
      preauthId: input.preauthId,
      status: 'captured',
      authAmountCents: authAmount,
      capturedAmountCents: input.captureAmountCents,
      tipAmountCents: input.tipAmountCents,
      finalAmountCents: totalCapture,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'capturePreauth', captureResult);
    }

    return { result: captureResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.preauth.captured', 'fnb_tab_preauths', input.preauthId);
  return result;
}
