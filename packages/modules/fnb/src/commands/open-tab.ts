import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabCourses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { OpenTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

/** Resolve course 1 name from fnb_course_definitions, fallback to 'Course 1'. */
async function resolveCourse1Name(tx: Parameters<Parameters<typeof publishWithOutbox>[1]>[0], tenantId: string, locationId: string): Promise<string> {
  try {
    const rows = await tx.execute(
      sql`SELECT course_name FROM fnb_course_definitions
          WHERE tenant_id = ${tenantId} AND location_id = ${locationId}
            AND course_number = 1 AND is_active = true
          LIMIT 1`,
    );
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length > 0 && arr[0]!.course_name) {
      return arr[0]!.course_name as string;
    }
  } catch {
    // Non-critical — fall back to default
  }
  return 'Course 1';
}

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
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Get next tab number via upsert on counter
    const counterResult = await tx.execute(
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
      const tableRows = await tx.execute(
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
    const [created] = await tx
      .insert(fnbTabs)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
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

    // Create default course 1 — use location's course definition name if available
    const course1Name = await resolveCourse1Name(tx, ctx.tenantId, ctx.locationId!);
    await tx
      .insert(fnbTabCourses)
      .values({
        tenantId: ctx.tenantId,
        tabId: created!.id,
        courseNumber: 1,
        courseName: course1Name,
        courseStatus: 'unsent',
      });

    // Update table live status if dine-in — with version guard to prevent silent overwrite (F5 fix)
    if (input.tableId) {
      const statusRows = await tx.execute(
        sql`SELECT id, version, status FROM fnb_table_live_status
            WHERE tenant_id = ${ctx.tenantId} AND table_id = ${input.tableId}
            FOR UPDATE`,
      );
      const statusArr = Array.from(statusRows as Iterable<Record<string, unknown>>);

      if (statusArr.length === 0) {
        // No live status row yet — insert
        await tx.execute(
          sql`INSERT INTO fnb_table_live_status (tenant_id, table_id, status, current_tab_id, current_server_user_id, party_size, seated_at, version, updated_at)
              VALUES (${ctx.tenantId}, ${input.tableId}, 'seated', ${created!.id}, ${input.serverUserId}, ${input.partySize ?? null}, NOW(), 1, NOW())`,
        );
      } else {
        const current = statusArr[0]!;
        const currentVersion = Number(current.version);
        const updated = await tx.execute(
          sql`UPDATE fnb_table_live_status
              SET status = 'seated',
                  current_tab_id = ${created!.id},
                  current_server_user_id = ${input.serverUserId},
                  party_size = ${input.partySize ?? null},
                  seated_at = NOW(),
                  version = ${currentVersion + 1},
                  updated_at = NOW()
              WHERE tenant_id = ${ctx.tenantId} AND table_id = ${input.tableId} AND version = ${currentVersion}
              RETURNING version`,
        );
        const updatedArr = Array.from(updated as Iterable<Record<string, unknown>>);
        if (updatedArr.length === 0) {
          throw new AppError('TABLE_VERSION_CONFLICT', `Concurrent modification detected on table ${input.tableId}`, 409);
        }
      }
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

  auditLogDeferred(ctx, 'fnb.tab.opened', 'fnb_tabs', result.id, undefined, {
    tabNumber: result.tabNumber,
    tableId: input.tableId,
    serverUserId: input.serverUserId,
  });

  return result;
}
