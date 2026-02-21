import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { TabNotFoundError, TabVersionConflictError, SplitNotAllowedError } from '../errors';
import type { RejoinChecksInput } from '../validation';

export async function rejoinChecks(
  ctx: RequestContext,
  locationId: string,
  input: RejoinChecksInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'rejoinChecks');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch tab
    const tabs = await tx.execute(
      sql`SELECT id, status, version FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    const tab = tabRows[0]!;
    if (Number(tab.version) !== input.expectedVersion) {
      throw new TabVersionConflictError(input.tabId);
    }

    if (tab.status !== 'split') {
      throw new SplitNotAllowedError(input.tabId, 'tab is not split — cannot rejoin');
    }

    // Check no payments applied to any child sessions
    const paidSessions = await tx.execute(
      sql`SELECT id FROM fnb_payment_sessions
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND paid_amount_cents > 0`,
    );
    if (Array.from(paidSessions as Iterable<Record<string, unknown>>).length > 0) {
      throw new SplitNotAllowedError(input.tabId, 'payments have already been applied — cannot rejoin');
    }

    // Revert tab status back to check_presented
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'check_presented', updated_at = NOW(), version = version + 1
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    // Remove pending payment sessions for this tab
    await tx.execute(
      sql`DELETE FROM fnb_payment_sessions
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND status = 'pending' AND paid_amount_cents = 0`,
    );

    const rejoined = { tabId: input.tabId, status: 'check_presented' };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'rejoinChecks', rejoined);
    }

    return { result: rejoined, events: [] };
  });

  await auditLog(ctx, 'fnb.tab.rejoined', 'fnb_tabs', input.tabId);
  return result;
}
