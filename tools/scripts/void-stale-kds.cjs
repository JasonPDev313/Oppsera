/**
 * Void stale KDS ticket items from previous business dates.
 * These are orphaned items invisible on the KDS screen (which filters by today's date)
 * but block station deletion.
 *
 * Run: node tools/scripts/void-stale-kds.cjs
 * Dry run: node tools/scripts/void-stale-kds.cjs --dry
 */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.vercel-prod' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, prepare: false });

const dryRun = process.argv.includes('--dry');

(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Today's business date: ${today}`);
    if (dryRun) console.log('*** DRY RUN — no changes will be made ***\n');

    // Find tenant
    const tenants = await sql`
      SELECT id, name FROM tenants
      WHERE LOWER(name) LIKE '%sunset%'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (tenants.length === 0) { console.log('No Sunset tenant found'); process.exit(1); }
    const tenantId = tenants[0].id;
    console.log(`Tenant: ${tenants[0].name} (${tenantId})\n`);

    // Diagnose: count stale items by station
    const staleItems = await sql`
      SELECT ks.name AS station_name, ks.id AS station_id,
             kti.item_status, COUNT(*)::int AS cnt,
             MIN(kt.business_date) AS oldest_date, MAX(kt.business_date) AS newest_date
      FROM fnb_kitchen_ticket_items kti
      JOIN fnb_kitchen_tickets kt ON kt.id = kti.ticket_id
      LEFT JOIN fnb_kitchen_stations ks ON ks.id = kti.station_id
      WHERE kti.tenant_id = ${tenantId}
        AND kti.item_status IN ('pending', 'cooking')
        AND kt.business_date < ${today}
      GROUP BY ks.name, ks.id, kti.item_status
      ORDER BY ks.name, kti.item_status
    `;

    if (staleItems.length === 0) {
      console.log('No stale ticket items found. All clear!');
      await sql.end();
      return;
    }

    console.log('=== Stale Ticket Items (from previous business dates) ===');
    let total = 0;
    for (const row of staleItems) {
      console.log(`  ${row.station_name || '(no station)'}: ${row.cnt} ${row.item_status} items (dates: ${row.oldest_date} to ${row.newest_date})`);
      total += row.cnt;
    }
    console.log(`  TOTAL: ${total} stale items\n`);

    if (dryRun) {
      console.log('Dry run complete. Run without --dry to void these items.');
      await sql.end();
      return;
    }

    // Void stale ticket items
    const voidedItems = await sql`
      UPDATE fnb_kitchen_ticket_items kti
      SET item_status = 'voided', voided_at = NOW(), updated_at = NOW()
      FROM fnb_kitchen_tickets kt
      WHERE kti.ticket_id = kt.id
        AND kti.tenant_id = ${tenantId}
        AND kti.item_status IN ('pending', 'cooking')
        AND kt.business_date < ${today}
      RETURNING kti.id
    `;
    console.log(`Voided ${voidedItems.length} stale ticket items.`);

    // Void parent tickets where ALL items are now terminal
    const voidedTickets = await sql`
      UPDATE fnb_kitchen_tickets kt
      SET status = 'voided', voided_at = NOW(), updated_at = NOW()
      WHERE kt.tenant_id = ${tenantId}
        AND kt.business_date < ${today}
        AND kt.status IN ('pending', 'in_progress')
        AND NOT EXISTS (
          SELECT 1 FROM fnb_kitchen_ticket_items kti2
          WHERE kti2.ticket_id = kt.id
            AND kti2.item_status NOT IN ('voided', 'served', 'ready')
        )
      RETURNING kt.id
    `;
    console.log(`Voided ${voidedTickets.length} parent tickets (all items terminal).`);

    console.log('\nDone! You should now be able to delete KDS stations.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
