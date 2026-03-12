require('dotenv').config({ path: require('path').join(__dirname, '../.env.remote'), override: true });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL_ADMIN, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

async function run() {
  const tenantId = '01KJ7X5E6DZ36PS7ZJM78EZNE9';
  const newTabId = '01KKJ1MMNPNP7YXDMVSVC14H98';

  // 1. New tab items
  const items = await sql`SELECT id, catalog_item_id, catalog_item_name, course_number, status FROM fnb_tab_items WHERE tab_id = ${newTabId}`;
  console.log('NEW TAB ITEMS:', JSON.stringify(items, null, 2));

  // 2. New tab courses
  const courses = await sql`SELECT course_number, course_status, course_name FROM fnb_tab_courses WHERE tab_id = ${newTabId} ORDER BY course_number`;
  console.log('\nNEW TAB COURSES:', JSON.stringify(courses, null, 2));

  // 3. Ticket for the new tab
  const tickets = await sql`SELECT id, ticket_number, status, location_id, course_number, sent_at FROM fnb_kitchen_tickets WHERE tab_id = ${newTabId}`;
  console.log('\nNEW TAB TICKETS:', JSON.stringify(tickets, null, 2));

  // 4. Ticket items for those tickets (with station info)
  for (const t of tickets) {
    const ticketItems = await sql`
      SELECT ti.id, ti.item_name, ti.station_id, ti.item_status, ti.order_line_id,
             s.display_name AS station_name, s.station_type
      FROM fnb_kitchen_ticket_items ti
      LEFT JOIN fnb_kitchen_stations s ON s.id = ti.station_id
      WHERE ti.ticket_id = ${t.id}
    `;
    console.log('\nTICKET ' + t.ticket_number + ' ITEMS:', JSON.stringify(ticketItems, null, 2));
  }

  // 5. The two old expo tickets (in_progress at resort venue)
  const oldTickets = await sql`
    SELECT kt.id, kt.ticket_number, kt.status, kt.location_id, kt.sent_at, kt.business_date,
           kti.item_name, kti.station_id, kti.item_status,
           s.display_name AS station_name, s.location_id AS station_location
    FROM fnb_kitchen_tickets kt
    JOIN fnb_kitchen_ticket_items kti ON kti.ticket_id = kt.id
    LEFT JOIN fnb_kitchen_stations s ON s.id = kti.station_id
    WHERE kt.tenant_id = ${tenantId}
      AND kt.status IN ('pending', 'in_progress')
    ORDER BY kt.sent_at ASC
  `;
  console.log('\nALL ACTIVE TICKET ITEMS:', JSON.stringify(oldTickets, null, 2));

  // 6. Quick check: which station IDs are being polled by KDS?
  // (Look at the station_counts endpoint)
  const siteStations = await sql`SELECT id, display_name, station_type, location_id FROM fnb_kitchen_stations WHERE location_id = '01KJ7X5EB98ZHYGD3G6MBT1AS4'`;
  const venueStations = await sql`SELECT id, display_name, station_type, location_id FROM fnb_kitchen_stations WHERE location_id = '01KJ7X5EB98ZHYGD3G6MBT1AS5'`;
  console.log('\nSITE STATIONS (Sunset Golf Resort):', JSON.stringify(siteStations, null, 2));
  console.log('VENUE STATIONS (Resort):', JSON.stringify(venueStations, null, 2));

  await sql.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
