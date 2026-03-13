#!/usr/bin/env node
/**
 * KDS Stale Ticket Cleanup — Pre-Launch Hygiene
 *
 * Voids ancient kitchen tickets that are still in pending/in_progress/ready
 * status but are older than the threshold (default: 24 hours).
 *
 * These are leftovers from development/testing cycles that would clutter
 * production KDS views on go-live day.
 *
 * Usage:
 *   DATABASE_URL=<your-db-url> node scripts/cleanup-stale-kds-tickets.cjs
 *
 * Options (env vars):
 *   DRY_RUN=1          — preview only, no mutations (default: dry run)
 *   DRY_RUN=0          — actually void the tickets
 *   THRESHOLD_HOURS=24 — minimum age to consider stale (default: 24)
 *   TENANT_ID=<id>     — REQUIRED — scope to a single tenant
 *   LOCATION_ID=<id>   — optional — further scope to a single location
 *
 * Safety:
 *   - Requires TENANT_ID to prevent accidental cross-tenant cleanup
 *   - Only touches tickets with status IN ('pending', 'in_progress', 'ready')
 *   - Sets status='voided', voided_at=NOW()
 *   - Also marks corresponding fnb_kds_send_tracking rows as 'cleared'
 *     ('cleared' is a recognized KdsSendStatus in list-kds-sends.ts)
 *   - Runs in a transaction — all or nothing
 *   - Dry run by default
 */

const postgres = require('postgres');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL environment variable');
    process.exit(1);
  }

  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    console.error('TENANT_ID is required — set it to scope cleanup to a single tenant.');
    console.error('Run check-kds-location-mismatch.cjs first to find your tenant ID.');
    process.exit(1);
  }

  const locationId = process.env.LOCATION_ID || null;
  const dryRun = process.env.DRY_RUN !== '0';
  const thresholdHours = parseInt(process.env.THRESHOLD_HOURS || '24', 10);

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   KDS Stale Ticket Cleanup                   ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Mode:      ${dryRun ? 'DRY RUN (preview only)' : '⚠️  LIVE — will void tickets'}   ║`);
  console.log(`║  Threshold: ${String(thresholdHours).padEnd(4)} hours                      ║`);
  console.log(`║  Tenant:    ${tenantId.slice(0, 26).padEnd(26)}       ║`);
  console.log(`║  Location:  ${(locationId ? locationId.slice(0, 26) : '(all)').padEnd(26)}       ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

  try {
    // 1. Survey stale tickets — scoped to tenant (+ optional location)
    const stale = locationId
      ? await sql`
          SELECT
            t.id,
            t.tenant_id,
            t.location_id,
            t.ticket_number,
            t.status,
            t.business_date,
            t.sent_at,
            ten.name AS tenant_name,
            l.name AS location_name,
            EXTRACT(EPOCH FROM (NOW() - t.sent_at)) / 3600 AS hours_old
          FROM fnb_kitchen_tickets t
          JOIN tenants ten ON ten.id = t.tenant_id
          JOIN locations l ON l.id = t.location_id AND l.tenant_id = t.tenant_id
          WHERE t.tenant_id = ${tenantId}
            AND t.location_id = ${locationId}
            AND t.status IN ('pending', 'in_progress', 'ready')
            AND t.sent_at < NOW() - INTERVAL '1 hour' * ${thresholdHours}
          ORDER BY t.sent_at ASC
        `
      : await sql`
          SELECT
            t.id,
            t.tenant_id,
            t.location_id,
            t.ticket_number,
            t.status,
            t.business_date,
            t.sent_at,
            ten.name AS tenant_name,
            l.name AS location_name,
            EXTRACT(EPOCH FROM (NOW() - t.sent_at)) / 3600 AS hours_old
          FROM fnb_kitchen_tickets t
          JOIN tenants ten ON ten.id = t.tenant_id
          JOIN locations l ON l.id = t.location_id AND l.tenant_id = t.tenant_id
          WHERE t.tenant_id = ${tenantId}
            AND t.status IN ('pending', 'in_progress', 'ready')
            AND t.sent_at < NOW() - INTERVAL '1 hour' * ${thresholdHours}
          ORDER BY t.sent_at ASC
        `;

    if (stale.length === 0) {
      console.log('✅ No stale tickets found. Nothing to clean up.\n');
      return;
    }

    // 2. Group by location for reporting
    const groups = new Map();
    for (const row of stale) {
      const key = `${row.tenant_name} → ${row.location_name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    console.log(`Found ${stale.length} stale ticket(s) across ${groups.size} location(s):\n`);

    for (const [group, tickets] of groups) {
      console.log(`  ${group}:`);
      for (const t of tickets) {
        const age = Math.round(Number(t.hours_old));
        console.log(`    #${t.ticket_number}  ${t.status.padEnd(12)}  ${age}h old  (${t.business_date})  [${t.id}]`);
      }
      console.log();
    }

    if (dryRun) {
      console.log('─── DRY RUN — no changes made ───');
      console.log('Run with DRY_RUN=0 to void these tickets.\n');
      return;
    }

    // 3. Void tickets + clear send tracking in a single transaction
    const ticketIds = stale.map((t) => t.id);

    const result = await sql.begin(async (tx) => {
      // Void the tickets
      const voided = await tx`
        UPDATE fnb_kitchen_tickets
        SET status = 'voided',
            voided_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(${ticketIds})
          AND tenant_id = ${tenantId}
          AND status IN ('pending', 'in_progress', 'ready')
      `;

      // Clear corresponding send tracking entries (using 'cleared' — a recognized KdsSendStatus)
      const cleared = await tx`
        UPDATE fnb_kds_send_tracking
        SET status = 'cleared',
            updated_at = NOW()
        WHERE ticket_id = ANY(${ticketIds})
          AND tenant_id = ${tenantId}
          AND status IN ('queued', 'sent', 'delivered', 'displayed')
      `;

      return { voidedCount: voided.count, clearedCount: cleared.count };
    });

    console.log(`✅ Voided ${result.voidedCount} ticket(s), cleared ${result.clearedCount} send tracking row(s).\n`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
