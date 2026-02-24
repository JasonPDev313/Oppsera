import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { TabNotFoundError, TabVersionConflictError, SplitNotAllowedError } from '../errors';
import type { ApplySplitStrategyInput } from '../validation';

const SPLITTABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_presented'];

export async function applySplitStrategy(
  ctx: RequestContext,
  locationId: string,
  input: ApplySplitStrategyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'applySplitStrategy');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch tab with version check
    const tabs = await tx.execute(
      sql`SELECT id, status, version, split_from_tab_id FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    const tab = tabRows[0]!;
    const currentStatus = tab.status as string;
    const currentVersion = Number(tab.version);

    if (currentVersion !== input.expectedVersion) {
      throw new TabVersionConflictError(input.tabId);
    }

    if (!SPLITTABLE_STATUSES.includes(currentStatus)) {
      throw new SplitNotAllowedError(input.tabId, `tab is in status '${currentStatus}'`);
    }

    // Cap recursive splits at 2 levels
    if (tab.split_from_tab_id) {
      // Check parent depth
      const parents = await tx.execute(
        sql`SELECT split_from_tab_id FROM fnb_tabs
            WHERE id = ${tab.split_from_tab_id} AND tenant_id = ${ctx.tenantId}`,
      );
      const parentRows = Array.from(parents as Iterable<Record<string, unknown>>);
      if (parentRows.length > 0 && parentRows[0]!.split_from_tab_id) {
        throw new SplitNotAllowedError(input.tabId, 'maximum split depth (2 levels) reached');
      }
    }

    // Update tab status to split and store split details
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'split', updated_at = NOW(), version = version + 1
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    // Store split in payment session for tracking
    await tx.execute(
      sql`INSERT INTO fnb_payment_sessions (
            tenant_id, tab_id, order_id, status,
            split_strategy, split_details,
            total_amount_cents, paid_amount_cents, remaining_amount_cents
          )
          VALUES (
            ${ctx.tenantId}, ${input.tabId}, ${input.orderId}, 'pending',
            ${input.strategy}, ${JSON.stringify({
              splitCount: input.splitCount,
              seatAssignments: input.seatAssignments,
              itemAssignments: input.itemAssignments,
              customAmounts: input.customAmounts,
            })},
            0, 0, 0
          )`,
    );

    const splitResult = {
      tabId: input.tabId,
      strategy: input.strategy,
      status: 'split',
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'applySplitStrategy', splitResult);
    }

    return { result: splitResult, events: [] };
  });

  await auditLog(ctx, 'fnb.tab.split_applied', 'fnb_tabs', input.tabId);
  return result;
}
