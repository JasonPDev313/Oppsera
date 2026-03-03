import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { autoProgressTableStatus } from '../commands/auto-progress-table-status';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Internal helper ────────────────────────────────────────────────────────

/**
 * Looks up the table_id associated with a given tab.
 * Bar tabs and takeout tabs have no table — returns null for those.
 */
async function resolveTableForTab(
  tenantId: string,
  tabId: string,
): Promise<string | null> {
  let tableId: string | null = null;

  await withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT table_id
      FROM fnb_tabs
      WHERE id        = ${tabId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const records = Array.from(rows as Iterable<Record<string, unknown>>);
    const record = records[0];
    if (record && record.table_id) {
      tableId = String(record.table_id);
    }
  });

  return tableId;
}

/**
 * Builds a synthetic RequestContext for system-driven auto-progress operations.
 * The system user has no human identity but must satisfy the ctx shape.
 */
function buildSystemContext(
  tenantId: string,
  locationId: string,
  tabId: string,
): RequestContext {
  return {
    tenantId,
    locationId,
    user: {
      id: 'system',
      email: 'system@oppsera.internal',
      role: 'system',
    },
    requestId: `auto-progress-${tabId}`,
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

// ── Consumer: fnb.course.sent.v1 ──────────────────────────────────────────

/**
 * When a course is sent to the kitchen, advance the table from 'seated'
 * to 'ordered'. Idempotent — if table is already 'ordered' or later, no-op.
 */
export async function handleCourseSentForTableStatus(data: {
  tenantId: string;
  locationId: string;
  tabId: string;
  courseNumber: number;
}): Promise<void> {
  try {
    // Guard: tabId must be a non-empty string (missing field in malformed event)
    if (!data.tabId) return;

    const tableId = await resolveTableForTab(data.tenantId, data.tabId);
    if (!tableId) return; // bar tab or takeout — no table to update

    const ctx = buildSystemContext(data.tenantId, data.locationId, data.tabId);

    await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'ordered',
      triggeredBy: 'fnb.course.sent.v1',
      tabId: data.tabId,
    });
  } catch (err) {
    // Consumers must never throw — log and continue
    console.error(
      `[handleCourseSentForTableStatus] Error for tab ${data.tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Consumer: fnb.course.fired.v1 ────────────────────────────────────────

/**
 * When entrees are fired from the kitchen, advance the table to 'entrees_fired'.
 * Only applies to course 1 (entrees) by convention; fires for any course number
 * since the command label is "entrees fired" at the expo level.
 */
export async function handleCourseFiredForTableStatus(data: {
  tenantId: string;
  locationId: string;
  tabId: string;
  courseNumber: number;
}): Promise<void> {
  try {
    // Guard: tabId must be a non-empty string (missing field in malformed event)
    if (!data.tabId) return;

    const tableId = await resolveTableForTab(data.tenantId, data.tabId);
    if (!tableId) return;

    const ctx = buildSystemContext(data.tenantId, data.locationId, data.tabId);

    await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'entrees_fired',
      triggeredBy: 'fnb.course.fired.v1',
      tabId: data.tabId,
    });
  } catch (err) {
    console.error(
      `[handleCourseFiredForTableStatus] Error for tab ${data.tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Consumer: fnb.payment.check_presented.v1 ─────────────────────────────

/**
 * When the server presents the check, advance the table to 'check_presented'.
 * This signals to the floor manager that the table is in final payment stage.
 */
export async function handleCheckPresentedForTableStatus(data: {
  tenantId: string;
  locationId: string;
  tabId: string;
}): Promise<void> {
  try {
    // Guard: tabId must be a non-empty string (missing field in malformed event)
    if (!data.tabId) return;

    const tableId = await resolveTableForTab(data.tenantId, data.tabId);
    if (!tableId) return;

    const ctx = buildSystemContext(data.tenantId, data.locationId, data.tabId);

    await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'check_presented',
      triggeredBy: 'fnb.payment.check_presented.v1',
      tabId: data.tabId,
    });
  } catch (err) {
    console.error(
      `[handleCheckPresentedForTableStatus] Error for tab ${data.tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Consumer: fnb.payment.completed.v1 ───────────────────────────────────

/**
 * When payment is completed in full, advance the table to 'paid'.
 * The table remains 'paid' until the tab is formally closed.
 */
export async function handlePaymentCompletedForTableStatus(data: {
  tenantId: string;
  locationId: string;
  tabId: string;
}): Promise<void> {
  try {
    // Guard: tabId must be a non-empty string (missing field in malformed event)
    if (!data.tabId) return;

    const tableId = await resolveTableForTab(data.tenantId, data.tabId);
    if (!tableId) return;

    const ctx = buildSystemContext(data.tenantId, data.locationId, data.tabId);

    await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'paid',
      triggeredBy: 'fnb.payment.completed.v1',
      tabId: data.tabId,
    });
  } catch (err) {
    console.error(
      `[handlePaymentCompletedForTableStatus] Error for tab ${data.tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Consumer: fnb.tab.closed.v1 ───────────────────────────────────────────

/**
 * When a tab is formally closed, mark the table as 'dirty' and clear all
 * session fields (currentTabId, server, partySize, seatedAt, guestNames, etc.).
 * Sets dirty_since so bussers can track turn-around time SLA.
 *
 * If tableId is provided directly in the event payload, use it — avoids
 * a DB roundtrip. Otherwise, look up from the tab record.
 */
export async function handleTabClosedForTableStatus(data: {
  tenantId: string;
  locationId: string;
  tabId: string;
  tableId?: string;
}): Promise<void> {
  try {
    // Guard: tabId must be a non-empty string (missing field in malformed event).
    // tableId from the event payload may be absent for bar/takeout tabs — that's
    // legitimate and handled below via the null early-return.
    if (!data.tabId) return;

    const tableId = data.tableId ?? (await resolveTableForTab(data.tenantId, data.tabId));
    if (!tableId) return; // bar tab or takeout

    const ctx = buildSystemContext(data.tenantId, data.locationId, data.tabId);

    await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'dirty',
      triggeredBy: 'fnb.tab.closed.v1',
      tabId: data.tabId,
      clearFields: true,
    });
  } catch (err) {
    console.error(
      `[handleTabClosedForTableStatus] Error for tab ${data.tabId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
