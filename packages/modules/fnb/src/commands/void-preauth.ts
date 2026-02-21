import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { PreauthNotFoundError, PreauthStatusConflictError } from '../errors';

interface VoidPreauthInput {
  clientRequestId?: string;
  preauthId: string;
  reason?: string;
}

export async function voidPreauth(
  ctx: RequestContext,
  locationId: string,
  input: VoidPreauthInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidPreauth');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch pre-auth
    const preauths = await tx.execute(
      sql`SELECT id, tab_id, status FROM fnb_tab_preauths
          WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rows = Array.from(preauths as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PreauthNotFoundError(input.preauthId);

    const preauth = rows[0]!;
    const status = preauth.status as string;

    if (status !== 'authorized') {
      throw new PreauthStatusConflictError(input.preauthId, status, 'void');
    }

    // Void the pre-auth
    await tx.execute(
      sql`UPDATE fnb_tab_preauths
          SET status = 'voided', voided_at = NOW(), updated_at = NOW()
          WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
    );

    // Check if tab has any remaining authorized pre-auths
    const remaining = await tx.execute(
      sql`SELECT COUNT(*) as cnt FROM fnb_tab_preauths
          WHERE tab_id = ${preauth.tab_id} AND tenant_id = ${ctx.tenantId}
            AND status = 'authorized' AND id != ${input.preauthId}`,
    );
    const remainingRows = Array.from(remaining as Iterable<Record<string, unknown>>);
    const count = Number(remainingRows[0]!.cnt);

    if (count === 0) {
      await tx.execute(
        sql`UPDATE fnb_tabs SET has_card_on_file = false, updated_at = NOW()
            WHERE id = ${preauth.tab_id} AND tenant_id = ${ctx.tenantId}`,
      );
    }

    const voidResult = {
      preauthId: input.preauthId,
      tabId: preauth.tab_id as string,
      status: 'voided',
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidPreauth', voidResult);
    }

    return { result: voidResult, events: [] };
  });

  await auditLog(ctx, 'fnb.preauth.voided', 'fnb_tab_preauths', input.preauthId);
  return result;
}
