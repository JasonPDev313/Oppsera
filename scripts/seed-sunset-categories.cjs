/**
 * seed-sunset-categories.cjs
 *
 * Remaps catalog items that still point to the old flat seed categories
 * to the correct leaf categories in the existing 3-level hierarchy.
 *
 * SAFE: only updates catalog_items.category_id — no deletes, no truncates.
 *
 * Usage:
 *   node scripts/seed-sunset-categories.cjs --remote --dry-run
 *   node scripts/seed-sunset-categories.cjs --remote
 */

const postgres = require('postgres');
const path = require('path');

const remote = process.argv.includes('--remote');
if (remote) {
  require('dotenv').config({ path: path.join(__dirname, '../.env.remote'), override: true });
}
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');
const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL_ADMIN or DATABASE_URL set');
  process.exit(1);
}

const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

async function main() {
  // ── Find tenant ────────────────────────────────────────────────
  const allTenants = await sql`SELECT id, slug, name FROM tenants ORDER BY created_at LIMIT 20`;
  const slugCandidates = ['sunset-resort', 'sunset-golf', 'sunset'];
  let tenant = allTenants.find(t => slugCandidates.includes(t.slug));
  if (!tenant && allTenants.length === 1) tenant = allTenants[0];
  if (!tenant) {
    console.log('Tenants:', allTenants.map(t => t.slug).join(', '));
    console.error('Could not identify the sunset tenant.');
    await sql.end();
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.slug} | ${tenant.name}`);

  // ── Load all categories for this tenant ────────────────────────
  const allCats = await sql`
    SELECT id, name, parent_id FROM catalog_categories
    WHERE tenant_id = ${tenantId}
    ORDER BY name
  `;

  function findCat(name) {
    return allCats.find(c => c.name === name);
  }

  // ── Identify old flat (root-only) categories to migrate away from
  const oldFlat = {
    apparel:   findCat('Apparel'),
    foodSnacks: findCat('Food & Snacks'),
    beverages: findCat('Beverages'),
    golfEquip: findCat('Golf Equipment'),
    greenFees: findCat('Green Fees')?.parent_id === null
      ? allCats.find(c => c.name === 'Green Fees' && !c.parent_id)
      : null,
  };

  // Find old Green Fees root vs new Green Fees child
  const greenFeesRoot = allCats.find(c => c.name === 'Green Fees' && !c.parent_id);
  const greenFeesChild = allCats.find(c => c.name === 'Green Fees' && c.parent_id);

  console.log('\nOld flat categories (will remap items away from):');
  if (oldFlat.apparel)   console.log(`  Apparel: ${oldFlat.apparel.id}`);
  if (oldFlat.foodSnacks) console.log(`  Food & Snacks: ${oldFlat.foodSnacks.id}`);
  if (oldFlat.beverages) console.log(`  Beverages: ${oldFlat.beverages.id}`);
  if (oldFlat.golfEquip) console.log(`  Golf Equipment: ${oldFlat.golfEquip.id}`);
  if (greenFeesRoot)     console.log(`  Green Fees (root/old): ${greenFeesRoot.id}`);

  // ── Target leaf categories ─────────────────────────────────────
  const targets = {
    mensApparel:  findCat("Men's Apparel"),
    snackBar:     findCat('Snack Bar'),
    barCocktails: findCat('Bar'),
    accessories:  findCat('Accessories'),
    greenFeesNew: greenFeesChild,
    rentals:      findCat('Rentals'),
    entrees:      findCat('Entrees'),
  };

  console.log('\nTarget leaf categories:');
  Object.entries(targets).forEach(([k, v]) =>
    console.log(`  ${k}: ${v ? v.name + ' (' + v.id + ')' : 'NOT FOUND'}`),
  );

  // ── Define remaps: SKU → target category ──────────────────────
  // Each entry: { sku, fromCatId (for verification), toCatId, reason }
  const remaps = [
    // Polo → Men's Apparel
    { sku: 'POLO-001', fromId: oldFlat.apparel?.id, toId: targets.mensApparel?.id, desc: "Men's Apparel" },
    // Hot Dog → Snack Bar
    { sku: 'FOOD-001', fromId: oldFlat.foodSnacks?.id, toId: targets.snackBar?.id, desc: 'Snack Bar' },
    // Clubhouse Burger (null) → Entrees
    { sku: 'FOOD-002', fromId: null, toId: targets.entrees?.id, desc: 'Entrees' },
    // Fountain Soda → Snack Bar
    { sku: 'BEV-001', fromId: oldFlat.beverages?.id, toId: targets.snackBar?.id, desc: 'Snack Bar' },
    // Draft Beer → Bar
    { sku: 'BEV-002', fromId: oldFlat.beverages?.id, toId: targets.barCocktails?.id, desc: 'Bar' },
    // Golf Glove → Accessories
    { sku: 'GOLF-001', fromId: oldFlat.golfEquip?.id, toId: targets.accessories?.id, desc: 'Accessories' },
    // Golf Balls → Accessories
    { sku: 'GOLF-002', fromId: oldFlat.golfEquip?.id, toId: targets.accessories?.id, desc: 'Accessories' },
    // 18-Hole Green Fee → Green Fees (child)
    { sku: 'GF-18', fromId: greenFeesRoot?.id, toId: targets.greenFeesNew?.id, desc: 'Green Fees (child)' },
    // 9-Hole Green Fee → Green Fees (child)
    { sku: 'GF-9', fromId: greenFeesRoot?.id, toId: targets.greenFeesNew?.id, desc: 'Green Fees (child)' },
    // Cart Rental → Rentals
    { sku: 'RENT-001', fromId: greenFeesRoot?.id, toId: targets.rentals?.id, desc: 'Rentals' },
  ];

  // ── Preview ────────────────────────────────────────────────────
  console.log('\nPlanned updates:');
  const items = await sql`SELECT id, sku, name, category_id FROM catalog_items WHERE tenant_id = ${tenantId}`;
  const itemBySku = Object.fromEntries(items.map(i => [i.sku, i]));

  let skipped = 0;
  const toApply = [];
  for (const r of remaps) {
    const item = itemBySku[r.sku];
    if (!item) { console.log(`  SKIP ${r.sku} — item not found`); skipped++; continue; }
    if (!r.toId) { console.log(`  SKIP ${r.sku} — target category not found`); skipped++; continue; }
    const currentMatch = r.fromId === null
      ? item.category_id === null
      : item.category_id === r.fromId;
    if (!currentMatch && item.category_id !== r.fromId) {
      console.log(`  SKIP ${r.sku} (${item.name}) — already has different categoryId ${item.category_id}`);
      skipped++;
      continue;
    }
    console.log(`  UPDATE ${r.sku} (${item.name}) → ${r.desc}`);
    toApply.push({ itemId: item.id, sku: r.sku, name: item.name, toId: r.toId, desc: r.desc });
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would update ${toApply.length} items, skip ${skipped}. Re-run without --dry-run to apply.`);
    await sql.end();
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────
  if (toApply.length === 0) {
    console.log('\nNothing to update — all items already correctly categorised.');
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const r of toApply) {
      await tx`UPDATE catalog_items SET category_id = ${r.toId} WHERE id = ${r.itemId}`;
      console.log(`  ✓ ${r.sku} (${r.name}) → ${r.desc}`);
    }
  });

  console.log(`\nDone. Updated ${toApply.length} items.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  await sql.end();
  process.exit(1);
});
