import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabCourses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { OpenTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function openTab(
  ctx: RequestContext,
  input: OpenTabInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to open a tab');
  }
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'openTab',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Get next tab number via upsert on counter
    const counterResult = await (tx as any).execute(
      sql`INSERT INTO fnb_tab_counters (tenant_id, location_id, business_date, last_number)
          VALUES (${ctx.tenantId}, ${ctx.locationId}, ${input.businessDate}, 1)
          ON CONFLICT (tenant_id, location_id, business_date)
          DO UPDATE SET last_number = fnb_tab_counters.last_number + 1
          RETURNING last_number`,
    );
    const tabNumber = Number(
      Array.from(counterResult as Iterable<Record<string, unknown>>)[0]!.last_number,
    );

    // If dine-in with a table, validate the table exists in fnb_tables
    if (input.tableId) {
      const tableRows = await (tx as any).execute(
        sql`SELECT id FROM fnb_tables
            WHERE id = ${input.tableId} AND tenant_id = ${ctx.tenantId}
            LIMIT 1`,
      );
      const tableArr = Array.from(tableRows as Iterable<Record<string, unknown>>);
      if (tableArr.length === 0) {
        throw new AppError('TABLE_NOT_FOUND', `Table ${input.tableId} not found`, 404);
      }
    }

    // Create the tab
    const [created] = await (tx as any)
      .insert(fnbTabs)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        tabNumber,
        tabType: input.tabType,
        status: 'open',
        tableId: input.tableId ?? null,
        serverUserId: input.serverUserId,
        openedBy: ctx.user.id,
        partySize: input.partySize ?? null,
        guestName: input.guestName ?? null,
        serviceType: input.serviceType,
        businessDate: input.businessDate,
        customerId: input.customerId ?? null,
        currentCourseNumber: 1,
        version: 1,
      })
      .returning();

    // Create default course 1
    await (tx as any)
      .insert(fnbTabCourses)
      .values({
        tenantId: ctx.tenantId,
        tabId: created!.id,
        courseNumber: 1,
        courseName: 'Course 1',
        courseStatus: 'unsent',
      });

    // Upsert table live status if dine-in (defensive: creates row if missing)
    if (input.tableId) {
      await (tx as any).execute(
        sql`INSERT INTO fnb_table_live_status (tenant_id, table_id, status, current_tab_id, current_server_user_id, party_size, seated_at, updated_at)
            VALUES (${ctx.tenantId}, ${input.tableId}, 'seated', ${created!.id}, ${input.serverUserId}, ${input.partySize ?? null}, NOW(), NOW())
            ON CONFLICT (tenant_id, table_id) DO UPDATE SET
              status = 'seated',
              current_tab_id = EXCLUDED.current_tab_id,
              current_server_user_id = EXCLUDED.current_server_user_id,
              party_size = EXCLUDED.party_size,
              seated_at = EXCLUDED.seated_at,
              updated_at = EXCLUDED.updated_at`,
      );
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_OPENED, {
      tabId: created!.id,
      locationId: ctx.locationId,
      tabNumber,
      tabType: input.tabType,
      tableId: input.tableId ?? null,
      serverUserId: input.serverUserId,
      businessDate: input.businessDate,
      partySize: input.partySize ?? null,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'openTab', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.opened', 'fnb_tabs', result.id, undefined, {
    tabNumber: result.tabNumber,
    tableId: input.tableId,
    serverUserId: input.serverUserId,
  });

  return result;
}
