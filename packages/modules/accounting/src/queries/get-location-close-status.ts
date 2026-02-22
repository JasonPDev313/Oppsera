import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TerminalCloseStatus {
  terminalId: string;
  terminalName: string | null;
  drawerSessionStatus: string | null;
  closeBatchStatus: string | null;
  closeBatchId: string | null;
}

export interface LocationCloseStatus {
  locationId: string;
  businessDate: string;
  retailTerminals: TerminalCloseStatus[];
  fnbBatchStatus: string | null;
  fnbBatchId: string | null;
  depositSlipId: string | null;
  depositSlipStatus: string | null;
  allTerminalsClosed: boolean;
  fnbClosed: boolean;
  depositReady: boolean;
}

export async function getLocationCloseStatus(
  tenantId: string,
  locationId: string,
  businessDate: string,
): Promise<LocationCloseStatus> {
  return withTenant(tenantId, async (tx) => {
    // Get retail terminal statuses
    const terminalRows = await tx.execute(sql`
      SELECT
        t.id AS terminal_id,
        t.terminal_number AS terminal_name,
        ds.status AS drawer_session_status,
        rcb.status AS close_batch_status,
        rcb.id AS close_batch_id
      FROM terminals t
      JOIN terminal_locations tl ON tl.id = t.profit_center_id
      LEFT JOIN drawer_sessions ds ON ds.terminal_id = t.id
        AND ds.tenant_id = ${tenantId}
        AND ds.business_date = ${businessDate}
      LEFT JOIN retail_close_batches rcb ON rcb.terminal_id = t.id
        AND rcb.tenant_id = ${tenantId}
        AND rcb.business_date = ${businessDate}
      WHERE tl.location_id = ${locationId}
        AND tl.tenant_id = ${tenantId}
        AND t.is_active = true
    `);
    const terminals = Array.from(terminalRows as Iterable<Record<string, unknown>>);

    const retailTerminals: TerminalCloseStatus[] = terminals.map((t) => ({
      terminalId: String(t.terminal_id),
      terminalName: t.terminal_name ? String(t.terminal_name) : null,
      drawerSessionStatus: t.drawer_session_status ? String(t.drawer_session_status) : null,
      closeBatchStatus: t.close_batch_status ? String(t.close_batch_status) : null,
      closeBatchId: t.close_batch_id ? String(t.close_batch_id) : null,
    }));

    // Get F&B close batch status
    const fnbRows = await tx.execute(sql`
      SELECT id, status
      FROM fnb_close_batches
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      LIMIT 1
    `);
    const fnbArr = Array.from(fnbRows as Iterable<Record<string, unknown>>);
    const fnbBatch = fnbArr[0] ?? null;

    // Get deposit slip status
    const depositRows = await tx.execute(sql`
      SELECT id, status
      FROM deposit_slips
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
      LIMIT 1
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const deposit = depositArr[0] ?? null;

    const allTerminalsClosed = retailTerminals.length === 0 ||
      retailTerminals.every((t) =>
        t.closeBatchStatus && ['posted', 'locked'].includes(t.closeBatchStatus),
      );

    const fnbClosed = !fnbBatch || ['posted', 'locked'].includes(String(fnbBatch.status));

    return {
      locationId,
      businessDate,
      retailTerminals,
      fnbBatchStatus: fnbBatch ? String(fnbBatch.status) : null,
      fnbBatchId: fnbBatch ? String(fnbBatch.id) : null,
      depositSlipId: deposit ? String(deposit.id) : null,
      depositSlipStatus: deposit ? String(deposit.status) : null,
      allTerminalsClosed,
      fnbClosed,
      depositReady: allTerminalsClosed && fnbClosed,
    };
  });
}
