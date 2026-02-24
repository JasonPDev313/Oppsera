import dotenv from 'dotenv';
dotenv.config({ path: '.env.remote' });

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!url) { console.error('No DATABASE_URL in .env.remote'); process.exit(1); }
  const client = postgres(url, { max: 1, prepare: false });

  const tenant = await client.unsafe("SELECT id FROM tenants WHERE name = 'Sunset Golf & Grill' LIMIT 1");
  const tid = tenant[0]?.id;
  console.log('Tenant ID:', tid);

  if (!tid) { console.log('No Sunset Golf tenant found!'); await client.end(); return; }

  const taxGroups = await client.unsafe('SELECT COUNT(*) as cnt FROM tax_groups WHERE tenant_id = $1', [tid]);
  console.log('Tax groups:', taxGroups[0]?.cnt);

  const taxRates = await client.unsafe('SELECT COUNT(*) as cnt FROM tax_rates WHERE tenant_id = $1', [tid]);
  console.log('Tax rates:', taxRates[0]?.cnt);

  const invItems = await client.unsafe('SELECT COUNT(*) as cnt FROM inventory_items WHERE tenant_id = $1', [tid]);
  console.log('Inventory items:', invItems[0]?.cnt);

  const locations = await client.unsafe('SELECT id, name, location_type FROM locations WHERE tenant_id = $1', [tid]);
  console.log('Locations:', locations.map((l: any) => `${l.name} (${l.location_type})`).join(', '));

  const terminals = await client.unsafe('SELECT COUNT(*) as cnt FROM terminals WHERE tenant_id = $1', [tid]);
  console.log('Terminals:', terminals[0]?.cnt);

  const settings = await client.unsafe('SELECT COUNT(*) as cnt FROM accounting_settings WHERE tenant_id = $1', [tid]);
  console.log('Accounting settings:', settings[0]?.cnt);

  const glAccounts = await client.unsafe('SELECT COUNT(*) as cnt FROM gl_accounts WHERE tenant_id = $1', [tid]);
  console.log('GL accounts for this tenant:', glAccounts[0]?.cnt);

  const users = await client.unsafe('SELECT id, email FROM users WHERE tenant_id = $1', [tid]);
  console.log('Users:', users.map((u: any) => u.email).join(', '));

  const orderCounters = await client.unsafe('SELECT * FROM order_counters WHERE tenant_id = $1', [tid]);
  console.log('Order counters:', orderCounters.length);

  await client.end();
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
