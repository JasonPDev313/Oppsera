import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';

/**
 * Refresh the server load snapshot for a given location and business date.
 *
 * Computes live stats for every active server assigned to the location today,
 * then replaces the snapshot rows via DELETE + batch INSERT.
 *
 * Must be called inside or outside a transaction — it uses withTenant() which
 * creates its own transaction-safe context with Supavisor pooling.
 */
export async function refreshServerLoadSnapshot(
  ctx: RequestContext,
  locationId: string,
  businessDate: string,
): Promise<void> {
  await withTenant(ctx.tenantId, async (tx) => {
    // 1. Get all active server assignments for the given location + date
    const assignmentRows = await tx.execute(sql`
      SELECT DISTINCT
        a.server_user_id,
        a.section_id,
        s.capacity_max AS section_capacity
      FROM fnb_server_assignments a
      LEFT JOIN fnb_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${ctx.tenantId}
        AND a.location_id = ${locationId}
        AND a.business_date = ${businessDate}
        AND a.status = 'active'
    `);

    const assignments = Array.from(assignmentRows as Iterable<Record<string, unknown>>);

    if (assignments.length === 0) {
      // No active servers — purge any stale snapshot rows and return
      await tx.execute(sql`
        DELETE FROM fnb_server_load_snapshots
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${locationId}
          AND business_date = ${businessDate}
      `);
      return;
    }

    // 2. Compute stats per server
    type ServerRow = {
      id: string;
      tenantId: string;
      locationId: string;
      serverUserId: string;
      businessDate: string;
      openTabCount: number;
      activeSeatedCount: number;
      totalCoverCount: number;
      avgTicketCents: number;
      sectionId: string | null;
      sectionCapacity: number | null;
    };

    const snapshots: ServerRow[] = [];

    for (const row of assignments) {
      const serverUserId = String(row.server_user_id);
      const sectionId = row.section_id ? String(row.section_id) : null;
      const sectionCapacity = row.section_capacity != null
        ? Number(row.section_capacity)
        : null;

      // Open tab count — tabs in 'open' status for this server today
      const openTabRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM fnb_tabs
        WHERE tenant_id = ${ctx.tenantId}
          AND server_user_id = ${serverUserId}
          AND business_date = ${businessDate}
          AND status = 'open'
      `);
      const openTabCount = Number(
        Array.from(openTabRows as Iterable<Record<string, unknown>>)[0]?.cnt ?? 0,
      );

      // Active seated count — tables currently assigned to this server and
      // in an active dining status
      const seatedRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM fnb_table_live_status
        WHERE tenant_id = ${ctx.tenantId}
          AND current_server_user_id = ${serverUserId}
          AND status IN ('seated', 'ordered', 'entrees_fired', 'dessert', 'check_presented')
      `);
      const activeSeatedCount = Number(
        Array.from(seatedRows as Iterable<Record<string, unknown>>)[0]?.cnt ?? 0,
      );

      // Total cover count — sum of party sizes from all tabs (open + closed) today
      const coverRows = await tx.execute(sql`
        SELECT COALESCE(SUM(party_size), 0)::int AS total
        FROM fnb_tabs
        WHERE tenant_id = ${ctx.tenantId}
          AND server_user_id = ${serverUserId}
          AND business_date = ${businessDate}
          AND status IN ('open', 'closed')
      `);
      const totalCoverCount = Number(
        Array.from(coverRows as Iterable<Record<string, unknown>>)[0]?.total ?? 0,
      );

      // Avg ticket cents — average total of closed tabs today (in cents).
      // Use ROUND before casting to ::int to avoid truncation of fractional averages.
      const avgTicketRows = await tx.execute(sql`
        SELECT COALESCE(ROUND(AVG(total_cents)), 0)::int AS avg_cents
        FROM fnb_tabs
        WHERE tenant_id = ${ctx.tenantId}
          AND server_user_id = ${serverUserId}
          AND business_date = ${businessDate}
          AND status = 'closed'
      `);
      const avgTicketCents = Number(
        Array.from(avgTicketRows as Iterable<Record<string, unknown>>)[0]?.avg_cents ?? 0,
      );

      snapshots.push({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId,
        serverUserId,
        businessDate,
        openTabCount,
        activeSeatedCount,
        totalCoverCount,
        avgTicketCents,
        sectionId,
        sectionCapacity,
      });
    }

    // 3. Replace snapshot rows atomically: DELETE then batch INSERT
    await tx.execute(sql`
      DELETE FROM fnb_server_load_snapshots
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
    `);

    if (snapshots.length > 0) {
      for (const snap of snapshots) {
        await tx.execute(sql`
          INSERT INTO fnb_server_load_snapshots (
            id, tenant_id, location_id, server_user_id, business_date,
            open_tab_count, active_seated_count, total_cover_count,
            avg_ticket_cents, section_id, section_capacity,
            last_refreshed_at, created_at, updated_at
          ) VALUES (
            ${snap.id}, ${snap.tenantId}, ${snap.locationId}, ${snap.serverUserId},
            ${snap.businessDate}, ${snap.openTabCount}, ${snap.activeSeatedCount},
            ${snap.totalCoverCount}, ${snap.avgTicketCents},
            ${snap.sectionId}, ${snap.sectionCapacity},
            now(), now(), now()
          )
        `);
      }
    }
  });
}
