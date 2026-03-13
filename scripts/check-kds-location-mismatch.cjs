#!/usr/bin/env node
/**
 * KDS Location Mismatch Checker
 *
 * Checks whether the backend is writing KDS tickets to a DIFFERENT location
 * than where the frontend expects to find them (site↔venue promotion mismatch).
 *
 * Usage:
 *   DATABASE_URL=<your-db-url> node scripts/check-kds-location-mismatch.cjs
 *
 * What to look for in the output:
 *   - "NO MISMATCH" → the location drift fix is sufficient
 *   - "MISMATCH DETECTED" → tickets are being written to a promoted location
 *     that the frontend can't see. The backend promotion logic needs to be
 *     removed or the frontend read queries need to include promoted locations.
 */

const postgres = require('postgres');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL environment variable');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

  try {
    // 1. Find all tenants that have KDS tickets in the last 7 days
    const tenants = await sql`
      SELECT DISTINCT t.tenant_id, ten.name
      FROM fnb_kitchen_tickets t
      JOIN tenants ten ON ten.id = t.tenant_id
      WHERE t.sent_at > NOW() - INTERVAL '7 days'
      ORDER BY ten.name
    `;

    if (tenants.length === 0) {
      console.log('No KDS tickets found in the last 7 days.');
      return;
    }

    console.log(`\nFound ${tenants.length} tenant(s) with recent KDS tickets:\n`);

    for (const tenant of tenants) {
      console.log(`━━━ ${tenant.name} (${tenant.tenant_id}) ━━━\n`);

      // 2. Show location hierarchy
      const locations = await sql`
        SELECT id, name, parent_location_id, location_type
        FROM locations
        WHERE tenant_id = ${tenant.tenant_id}
        ORDER BY parent_location_id NULLS FIRST, name
      `;

      console.log('  LOCATION HIERARCHY:');
      for (const loc of locations) {
        const indent = loc.parent_location_id ? '    ↳ ' : '  ';
        const type = loc.location_type ? ` (${loc.location_type})` : '';
        console.log(`${indent}${loc.name}${type} → ${loc.id}`);
      }

      // 3. Show where KDS stations are configured
      const stations = await sql`
        SELECT s.id, s.name, s.station_type, s.location_id, l.name AS location_name
        FROM fnb_kitchen_stations s
        JOIN locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${tenant.tenant_id}
          AND s.is_active = true
        ORDER BY l.name, s.name
      `;

      console.log('\n  KDS STATIONS:');
      for (const st of stations) {
        console.log(`    ${st.name} (${st.station_type}) → at location: ${st.location_name} (${st.location_id})`);
      }

      // 4. Show where routing rules point
      const rules = await sql`
        SELECT r.location_id, l.name AS location_name, COUNT(*) AS rule_count
        FROM fnb_kitchen_routing_rules r
        JOIN locations l ON l.id = r.location_id AND l.tenant_id = r.tenant_id
        WHERE r.tenant_id = ${tenant.tenant_id}
          AND r.is_active = true
        GROUP BY r.location_id, l.name
        ORDER BY l.name
      `;

      console.log('\n  ROUTING RULES:');
      if (rules.length === 0) {
        console.log('    (none — fallback routing only)');
      } else {
        for (const r of rules) {
          console.log(`    ${r.rule_count} rules at: ${r.location_name} (${r.location_id})`);
        }
      }

      // 5. Show where tickets are actually being written
      const ticketLocations = await sql`
        SELECT t.location_id, l.name AS location_name, l.parent_location_id,
               COUNT(*) AS ticket_count,
               MIN(t.sent_at) AS earliest,
               MAX(t.sent_at) AS latest
        FROM fnb_kitchen_tickets t
        JOIN locations l ON l.id = t.location_id AND l.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${tenant.tenant_id}
          AND t.sent_at > NOW() - INTERVAL '7 days'
        GROUP BY t.location_id, l.name, l.parent_location_id
        ORDER BY ticket_count DESC
      `;

      console.log('\n  TICKETS WRITTEN TO (last 7 days):');
      for (const tl of ticketLocations) {
        const parentNote = tl.parent_location_id ? ' (child venue)' : ' (parent site)';
        console.log(`    ${tl.ticket_count} tickets at: ${tl.location_name}${parentNote} (${tl.location_id})`);
      }

      // 6. Check for the actual mismatch
      // Tabs are opened at a location. If the ticket's location_id differs
      // from the tab's location_id, the backend promoted.
      const mismatches = await sql`
        SELECT
          t.location_id AS ticket_location_id,
          tl.name AS ticket_location_name,
          tab.location_id AS tab_location_id,
          tabl.name AS tab_location_name,
          COUNT(*) AS count
        FROM fnb_kitchen_tickets t
        JOIN fnb_tabs tab ON tab.id = t.tab_id AND tab.tenant_id = t.tenant_id
        JOIN locations tl ON tl.id = t.location_id AND tl.tenant_id = t.tenant_id
        JOIN locations tabl ON tabl.id = tab.location_id AND tabl.tenant_id = tab.tenant_id
        WHERE t.tenant_id = ${tenant.tenant_id}
          AND t.sent_at > NOW() - INTERVAL '7 days'
          AND t.location_id != tab.location_id
        GROUP BY t.location_id, tl.name, tab.location_id, tabl.name
        ORDER BY count DESC
      `;

      console.log('\n  ▶ MISMATCH CHECK (ticket location ≠ tab location):');
      if (mismatches.length === 0) {
        console.log('    ✅ NO MISMATCH — tickets are at the same location as their tabs.');
        console.log('    The location drift fix is sufficient.\n');
      } else {
        console.log('    ⚠️  MISMATCH DETECTED — backend promotion is active:\n');
        for (const m of mismatches) {
          console.log(`    ${m.count} tickets: tab at "${m.tab_location_name}" (${m.tab_location_id})`);
          console.log(`                → ticket written to "${m.ticket_location_name}" (${m.ticket_location_id})`);
        }
        console.log('\n    This means the frontend is querying location A but tickets');
        console.log('    are stored at location B. The backend resolveKdsLocationId()');
        console.log('    promotion logic needs to be removed.\n');
      }

      // 7. Check for ancient tickets still showing (the 400-hour issue)
      const ancient = await sql`
        SELECT id, ticket_number, status, location_id,
               EXTRACT(EPOCH FROM (NOW() - sent_at)) / 3600 AS hours_old
        FROM fnb_kitchen_tickets
        WHERE tenant_id = ${tenant.tenant_id}
          AND status IN ('pending', 'in_progress', 'ready')
          AND sent_at < NOW() - INTERVAL '24 hours'
        ORDER BY sent_at ASC
        LIMIT 10
      `;

      if (ancient.length > 0) {
        console.log('  ⚠️  ANCIENT TICKETS (>24h, still active):');
        for (const a of ancient) {
          console.log(`    #${a.ticket_number} — ${Math.round(Number(a.hours_old))}h old, status: ${a.status}, location: ${a.location_id}`);
        }
        console.log('    These should have been caught by the 24h filter in get-expo-view.');
        console.log('    If you see these, the deployed build may not include the filter.\n');
      }
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
