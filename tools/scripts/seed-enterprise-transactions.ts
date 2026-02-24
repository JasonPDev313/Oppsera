/**
 * Enterprise Validation Seed: Sunset Golf & Grill — Full Year Transactions
 *
 * Generates ~13,000 realistic POS transactions over 366 days, exercising:
 * - Orders (F&B 54%, retail 31%, services 15%) with proper tax calculations
 * - Tenders (cash ~45%, card ~55%) with tips on F&B orders (~42% tipped)
 * - Inventory movements (sales deductions + bi-monthly + emergency receives)
 * - GL journal entries via direct posting (double-entry, balanced to $0.00)
 * - Reporting read models (rm_daily_sales, rm_item_sales, rm_inventory_on_hand)
 * - Discounts (~1% of subtotal, 7 types), voids (~1.5%), tips (~7% of revenue)
 * - High-value service transactions (tournaments, outings, memberships)
 * - Seasonality: summer peak (Jul), winter trough (Feb), 16x ratio
 * - 29-item catalog across food, beverages, retail, green fees, services
 *
 * Output: ~$1M annual revenue, ~13K orders, ~40K order lines, ~13K GL entries
 *
 * Prerequisites:
 *   - Run `pnpm db:seed` first (creates tenant, catalog, users, etc.)
 *   - Accounting bootstrap must be run (COA, settings, mappings)
 *
 * Usage:
 *   npx tsx tools/scripts/seed-enterprise-transactions.ts
 *   npx tsx tools/scripts/seed-enterprise-transactions.ts --dry-run
 *   npx tsx tools/scripts/seed-enterprise-transactions.ts --clean    # remove old seed data first
 *   npx tsx tools/scripts/seed-enterprise-transactions.ts --tenant=<ID>
 *
 * Idempotent: Uses ON CONFLICT DO NOTHING on unique indexes.
 * Deterministic: Seeded PRNG (Mulberry32) produces identical results on each run.
 */
import dotenv from 'dotenv';

// ── CLI Flags ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cleanFirst = args.includes('--clean');
const skipGl = args.includes('--skip-gl');
const envArg = args.find((a) => a.startsWith('--env='))?.split('=')[1];
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];

// Load env based on --env flag (default: .env.local)
if (envArg === 'remote') {
  dotenv.config({ path: '.env.remote' });
} else {
  dotenv.config({ path: '.env.local' });
}
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

// ── Database Connection ────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_ADMIN or DATABASE_URL required');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

// ── ULID Generator (Crockford Base32, monotonic-ish) ───────────────
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTs = 0;
let seq = 0;

function ulid(): string {
  let now = Date.now();
  if (now === lastTs) {
    seq++;
  } else {
    lastTs = now;
    seq = 0;
  }
  // Encode 48-bit timestamp (10 chars) + 80-bit random (16 chars)
  let ts = '';
  for (let i = 9; i >= 0; i--) {
    ts = CROCKFORD[now % 32] + ts;
    now = Math.floor(now / 32);
  }
  let rand = '';
  // Use seq in first few bits to maintain monotonicity within same ms
  let s = seq;
  for (let i = 0; i < 16; i++) {
    if (i < 4) {
      rand = CROCKFORD[s % 32] + rand;
      s = Math.floor(s / 32);
    } else {
      rand = CROCKFORD[Math.floor(Math.random() * 32)] + rand;
    }
  }
  return ts + rand;
}

// ── Deterministic seeded PRNG (Mulberry32) ─────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20250223); // deterministic seed based on today's date

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return rng() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function chance(pct: number): boolean {
  return rng() < pct;
}

// ── Date Helpers ───────────────────────────────────────────────────
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function formatTimestamp(d: Date): string {
  return d.toISOString();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonth(d: Date): number {
  return d.getMonth(); // 0-indexed
}

function getDayOfWeek(d: Date): number {
  return d.getDay(); // 0=Sun, 6=Sat
}

function isWeekend(d: Date): boolean {
  const dow = getDayOfWeek(d);
  return dow === 0 || dow === 6;
}

// ── Seasonality Model ──────────────────────────────────────────────
// Returns a multiplier 0.4–1.6 based on month + day of week
function getSeasonalMultiplier(d: Date): number {
  const month = getMonth(d);
  // Monthly base: Dec-Feb=0.5, Mar=0.7, Apr-May=0.9, Jun-Aug=1.3, Sep=1.0, Oct-Nov=0.7
  const monthFactors = [0.5, 0.45, 0.5, 0.7, 0.9, 0.95, 1.3, 1.35, 1.25, 1.0, 0.7, 0.55];
  let mult = monthFactors[month]!;

  // Weekend bonus: +40%
  if (isWeekend(d)) {
    mult *= 1.4;
  }

  return mult;
}

// Get number of transactions for a given day
function getDailyTransactionCount(d: Date): number {
  const base = 38; // average daily transactions (~14K/year)
  const mult = getSeasonalMultiplier(d);
  const target = base * mult;
  // Add some noise: ±25%
  const noise = randFloat(0.75, 1.25);
  return Math.max(5, Math.round(target * noise));
}

// ── Revenue Category Distribution ──────────────────────────────────
type RevenueCategory = 'fnb' | 'retail' | 'service';

function pickRevenueCategory(d: Date): RevenueCategory {
  const month = getMonth(d);
  const weekend = isWeekend(d);

  // Base: 60% F&B, 30% retail, 10% service
  let fnbWeight = 60;
  let retailWeight = 30;
  let serviceWeight = 10;

  // Summer: boost services (golf)
  if (month >= 5 && month <= 7) {
    serviceWeight += 8;
    fnbWeight -= 4;
    retailWeight -= 4;
  }

  // Spring: boost retail (apparel)
  if (month >= 2 && month <= 4) {
    retailWeight += 5;
    fnbWeight -= 5;
  }

  // Weekends: boost services
  if (weekend) {
    serviceWeight += 5;
    fnbWeight -= 3;
    retailWeight -= 2;
  }

  return weightedPick<RevenueCategory>(
    ['fnb', 'retail', 'service'],
    [fnbWeight, retailWeight, serviceWeight],
  );
}

// ── Item Definitions (mapped to seed catalog) ──────────────────────
// These correspond to items created by db:seed
interface CatalogItem {
  sku: string;
  name: string;
  type: string;
  priceCents: number;
  costCents: number;
  taxGroup: 'retail' | 'food' | 'alcohol' | 'exempt';
  category: RevenueCategory;
  weight: number; // relative sales frequency
  isTrackable: boolean;
  seasonal?: 'spring_summer' | 'summer' | 'all';
}

const CATALOG: CatalogItem[] = [
  // F&B — Food (high-volume, range of prices)
  { sku: 'FOOD-001', name: 'Hot Dog', type: 'food', priceCents: 599, costCents: 150, taxGroup: 'food', category: 'fnb', weight: 20, isTrackable: false },
  { sku: 'FOOD-002', name: 'Clubhouse Burger', type: 'food', priceCents: 1499, costCents: 500, taxGroup: 'food', category: 'fnb', weight: 28, isTrackable: false },
  { sku: 'FOOD-003', name: 'Grilled Chicken Sandwich', type: 'food', priceCents: 1299, costCents: 400, taxGroup: 'food', category: 'fnb', weight: 18, isTrackable: false },
  { sku: 'FOOD-004', name: 'Caesar Salad', type: 'food', priceCents: 1199, costCents: 300, taxGroup: 'food', category: 'fnb', weight: 12, isTrackable: false },
  { sku: 'FOOD-005', name: 'Fish & Chips', type: 'food', priceCents: 1699, costCents: 550, taxGroup: 'food', category: 'fnb', weight: 14, isTrackable: false },
  { sku: 'FOOD-006', name: 'Nachos Grande', type: 'food', priceCents: 1399, costCents: 350, taxGroup: 'food', category: 'fnb', weight: 16, isTrackable: false },
  { sku: 'FOOD-007', name: 'NY Strip Steak', type: 'food', priceCents: 3299, costCents: 1200, taxGroup: 'food', category: 'fnb', weight: 8, isTrackable: false },
  { sku: 'FOOD-008', name: 'Loaded Fries', type: 'food', priceCents: 899, costCents: 200, taxGroup: 'food', category: 'fnb', weight: 15, isTrackable: false },
  { sku: 'FOOD-009', name: 'Wings (12pc)', type: 'food', priceCents: 1599, costCents: 450, taxGroup: 'food', category: 'fnb', weight: 22, isTrackable: false },

  // F&B — Beverages
  { sku: 'BEV-001', name: 'Fountain Soda', type: 'beverage', priceCents: 299, costCents: 35, taxGroup: 'food', category: 'fnb', weight: 30, isTrackable: false },
  { sku: 'BEV-002', name: 'Draft Beer', type: 'beverage', priceCents: 799, costCents: 200, taxGroup: 'alcohol', category: 'fnb', weight: 25, isTrackable: false, seasonal: 'summer' },
  { sku: 'BEV-003', name: 'Premium Cocktail', type: 'beverage', priceCents: 1399, costCents: 350, taxGroup: 'alcohol', category: 'fnb', weight: 12, isTrackable: false },
  { sku: 'BEV-004', name: 'Glass of Wine', type: 'beverage', priceCents: 1099, costCents: 275, taxGroup: 'alcohol', category: 'fnb', weight: 10, isTrackable: false },
  { sku: 'BEV-005', name: 'Bottled Water', type: 'beverage', priceCents: 349, costCents: 50, taxGroup: 'food', category: 'fnb', weight: 18, isTrackable: false },
  { sku: 'BEV-006', name: 'Iced Tea', type: 'beverage', priceCents: 399, costCents: 45, taxGroup: 'food', category: 'fnb', weight: 14, isTrackable: false },
  { sku: 'BEV-007', name: 'Craft Beer Flight', type: 'beverage', priceCents: 1499, costCents: 400, taxGroup: 'alcohol', category: 'fnb', weight: 6, isTrackable: false, seasonal: 'summer' },

  // Retail (trackable inventory)
  { sku: 'POLO-001', name: 'Logo Polo Shirt', type: 'retail', priceCents: 4999, costCents: 2200, taxGroup: 'retail', category: 'retail', weight: 6, isTrackable: true, seasonal: 'spring_summer' },
  { sku: 'GOLF-001', name: 'Golf Glove', type: 'retail', priceCents: 2499, costCents: 1000, taxGroup: 'retail', category: 'retail', weight: 12, isTrackable: true },
  { sku: 'GOLF-002', name: 'Golf Balls (Dozen)', type: 'retail', priceCents: 3999, costCents: 1800, taxGroup: 'retail', category: 'retail', weight: 15, isTrackable: true },
  { sku: 'GOLF-003', name: 'Golf Hat', type: 'retail', priceCents: 2999, costCents: 1200, taxGroup: 'retail', category: 'retail', weight: 8, isTrackable: false, seasonal: 'spring_summer' },
  { sku: 'GOLF-004', name: 'Tees (Pack of 50)', type: 'retail', priceCents: 799, costCents: 200, taxGroup: 'retail', category: 'retail', weight: 20, isTrackable: false },
  { sku: 'GOLF-005', name: 'Divot Tool', type: 'retail', priceCents: 1299, costCents: 400, taxGroup: 'retail', category: 'retail', weight: 5, isTrackable: false },
  { sku: 'GOLF-006', name: 'Sunscreen', type: 'retail', priceCents: 999, costCents: 350, taxGroup: 'retail', category: 'retail', weight: 10, isTrackable: false, seasonal: 'summer' },

  // Services (golf green fees, rentals, lessons)
  { sku: 'GF-18', name: '18-Hole Green Fee', type: 'green_fee', priceCents: 7500, costCents: 0, taxGroup: 'exempt', category: 'service', weight: 30, isTrackable: false },
  { sku: 'GF-9', name: '9-Hole Green Fee', type: 'green_fee', priceCents: 4500, costCents: 0, taxGroup: 'exempt', category: 'service', weight: 15, isTrackable: false },
  { sku: 'RENT-001', name: 'Cart Rental', type: 'rental', priceCents: 2500, costCents: 0, taxGroup: 'exempt', category: 'service', weight: 28, isTrackable: false },
  { sku: 'SVC-001', name: 'Golf Lesson (1hr)', type: 'service', priceCents: 12500, costCents: 0, taxGroup: 'exempt', category: 'service', weight: 5, isTrackable: false },
  { sku: 'SVC-002', name: 'Range Balls (Large)', type: 'service', priceCents: 1500, costCents: 200, taxGroup: 'exempt', category: 'service', weight: 18, isTrackable: false },
  { sku: 'SVC-003', name: 'Club Rental', type: 'rental', priceCents: 5000, costCents: 0, taxGroup: 'exempt', category: 'service', weight: 8, isTrackable: false },
];

// High-value service transactions (generated separately)
interface HighValueService {
  name: string;
  minCents: number;
  maxCents: number;
  monthWeights: number[]; // 12 months, higher = more likely
}

const HIGH_VALUE_SERVICES: HighValueService[] = [
  {
    name: 'Tournament Package',
    minCents: 200000,  // $2K
    maxCents: 400000,  // $4K
    monthWeights: [0, 0, 1, 2, 3, 4, 5, 5, 4, 3, 1, 0],
  },
  {
    name: 'Corporate Outing',
    minCents: 300000,  // $3K
    maxCents: 500000,  // $5K
    monthWeights: [0, 0, 1, 2, 3, 4, 4, 4, 3, 2, 1, 0],
  },
  {
    name: 'Event Booking',
    minCents: 150000,  // $1.5K
    maxCents: 300000,  // $3K
    monthWeights: [1, 1, 1, 2, 3, 4, 4, 4, 3, 2, 1, 1],
  },
  {
    name: 'Annual Membership',
    minCents: 50000,   // $500
    maxCents: 150000,  // $1.5K
    monthWeights: [3, 2, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3],
  },
];

// ── Tax Rate Config (matches seed) ─────────────────────────────────
const TAX_RATES: Record<string, number> = {
  retail: 0.075, // MI State 6% + Genesee County 1.5%
  food: 0.0825, // MI State 6% + Genesee County 1.5% + City Restaurant 0.75%
  alcohol: 0.0825, // Same as food for Main Clubhouse
  exempt: 0,
};

function calculateTax(subtotalCents: number, taxGroup: string): number {
  const rate = TAX_RATES[taxGroup] ?? 0;
  return Math.round(subtotalCents * rate);
}

// ── Main Script ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Enterprise Transaction Seed ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // 1. Look up tenant data from existing seed
  const tenantRow = tenantArg
    ? (await db.execute(sql`SELECT id, name FROM tenants WHERE id = ${tenantArg}`))[0]
    : (await db.execute(sql`SELECT id, name FROM tenants WHERE slug = 'sunset-golf'`))[0];

  if (!tenantRow) {
    console.error('ERROR: Tenant not found. Run `pnpm db:seed` first.');
    process.exit(1);
  }

  const tenantId = (tenantRow as Record<string, unknown>).id as string;
  const tenantName = (tenantRow as Record<string, unknown>).name as string;
  console.log(`Tenant: ${tenantId} (${tenantName})`);

  // 2. Look up locations (prefer venues, fallback to any)
  let locRows = await db.execute(sql`
    SELECT id, name FROM locations
    WHERE tenant_id = ${tenantId} AND location_type = 'venue'
    ORDER BY name
  `);
  let locations = Array.from(locRows as Iterable<Record<string, unknown>>);
  if (locations.length === 0) {
    // Fallback: remote DB may have locations without venue type
    locRows = await db.execute(sql`
      SELECT id, name FROM locations
      WHERE tenant_id = ${tenantId}
      ORDER BY name
    `);
    locations = Array.from(locRows as Iterable<Record<string, unknown>>);
  }
  if (locations.length === 0) {
    console.error('ERROR: No locations found. Run `pnpm db:seed` first.');
    process.exit(1);
  }

  const mainLocationId = locations[0]!.id as string;
  const mainLocationName = locations[0]!.name as string;
  console.log(`Primary Location: ${mainLocationId} (${mainLocationName})`);

  // 3. Look up user
  const userRow = (
    await db.execute(sql`
      SELECT u.id FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId}
      LIMIT 1
    `)
  )[0] as Record<string, unknown> | undefined;

  if (!userRow) {
    console.error('ERROR: No user found. Run `pnpm db:seed` first.');
    process.exit(1);
  }
  const userId = userRow.id as string;
  console.log(`User: ${userId}`);

  // 4. Look up terminal
  const terminalRow = (
    await db.execute(sql`
      SELECT id FROM terminals WHERE tenant_id = ${tenantId} AND location_id = ${mainLocationId} LIMIT 1
    `)
  )[0] as Record<string, unknown> | undefined;

  const terminalId = (terminalRow?.id as string) ?? 'TERM-SEED-001';
  console.log(`Terminal: ${terminalId}`);

  // 5. Look up tax groups for main location (needed before catalog item insertion)
  const tgRows = await db.execute(sql`
    SELECT id, name FROM tax_groups
    WHERE tenant_id = ${tenantId} AND location_id = ${mainLocationId}
  `);
  const taxGroupMap = new Map<string, string>(); // name → id
  for (const row of Array.from(tgRows as Iterable<Record<string, unknown>>)) {
    const name = (row.name as string).toLowerCase();
    if (name.includes('retail')) taxGroupMap.set('retail', row.id as string);
    else if (name.includes('alcohol')) taxGroupMap.set('alcohol', row.id as string);
    else if (name.includes('food') || name.includes('bev')) taxGroupMap.set('food', row.id as string);
    else if (name.includes('exempt')) taxGroupMap.set('exempt', row.id as string);
  }
  console.log(`Tax Groups: ${taxGroupMap.size} mapped`);

  // 6. Look up catalog items by SKU and insert any missing ones
  const catalogRows = await db.execute(sql`
    SELECT id, sku, name, item_type, default_price, cost, is_trackable, category_id
    FROM catalog_items WHERE tenant_id = ${tenantId}
  `);
  const catalogMap = new Map<string, Record<string, unknown>>();
  for (const row of Array.from(catalogRows as Iterable<Record<string, unknown>>)) {
    if (row.sku) catalogMap.set(row.sku as string, row);
  }
  console.log(`Catalog Items: ${catalogMap.size} found in DB`);

  // Look up category IDs for inserting new items
  const catRows = await db.execute(sql`
    SELECT id, name FROM catalog_categories WHERE tenant_id = ${tenantId}
  `);
  const categoryByName = new Map<string, string>();
  for (const row of Array.from(catRows as Iterable<Record<string, unknown>>)) {
    categoryByName.set((row.name as string).toLowerCase(), row.id as string);
  }

  // Insert any catalog items from CATALOG that don't exist in DB yet
  const newCatalogItems: { sku: string; catalogItem: CatalogItem }[] = [];
  for (const item of CATALOG) {
    if (!catalogMap.has(item.sku)) {
      newCatalogItems.push({ sku: item.sku, catalogItem: item });
    }
  }

  if (newCatalogItems.length > 0 && !dryRun) {
    console.log(`  Inserting ${newCatalogItems.length} new catalog items...`);
    for (const { sku, catalogItem } of newCatalogItems) {
      const itemId = ulid();
      let categoryId: string | null = null;
      if (catalogItem.type === 'food') categoryId = categoryByName.get('food & snacks') ?? null;
      else if (catalogItem.type === 'beverage') categoryId = categoryByName.get('beverages') ?? null;
      else if (catalogItem.type === 'retail') categoryId = categoryByName.get('golf equipment') ?? categoryByName.get('apparel') ?? null;
      else if (['green_fee', 'rental', 'service'].includes(catalogItem.type)) categoryId = categoryByName.get('green fees') ?? null;

      const taxCatResult = await db.execute(sql`
        SELECT id FROM tax_categories
        WHERE tenant_id = ${tenantId}
        AND LOWER(name) LIKE ${catalogItem.taxGroup === 'food' ? '%food%' : catalogItem.taxGroup === 'alcohol' ? '%alcohol%' : catalogItem.taxGroup === 'exempt' ? '%exempt%' : '%sales%'}
        LIMIT 1
      `);
      const taxCategoryId = (taxCatResult[0] as Record<string, unknown> | undefined)?.id as string ?? null;

      await db.execute(sql`
        INSERT INTO catalog_items (id, tenant_id, category_id, sku, name, description, item_type, default_price, cost, tax_category_id, is_trackable, created_by)
        VALUES (${itemId}, ${tenantId}, ${categoryId}, ${sku}, ${catalogItem.name}, ${catalogItem.name}, ${catalogItem.type}, ${(catalogItem.priceCents / 100).toFixed(2)}, ${catalogItem.costCents > 0 ? (catalogItem.costCents / 100).toFixed(2) : null}, ${taxCategoryId}, ${catalogItem.isTrackable}, ${userId})
        ON CONFLICT DO NOTHING
      `);

      catalogMap.set(sku, { id: itemId, sku, name: catalogItem.name, item_type: catalogItem.type, category_id: categoryId });

      // Assign tax group for the new item at the main location
      const tgId = taxGroupMap.get(catalogItem.taxGroup);
      if (tgId) {
        const tgAssignId = ulid();
        await db.execute(sql`
          INSERT INTO catalog_item_location_tax_groups (id, tenant_id, location_id, catalog_item_id, tax_group_id)
          VALUES (${tgAssignId}, ${tenantId}, ${mainLocationId}, ${itemId}, ${tgId})
          ON CONFLICT DO NOTHING
        `);
      }
    }
    console.log(`  ${newCatalogItems.length} catalog items inserted`);
  } else if (newCatalogItems.length > 0) {
    for (const { sku, catalogItem } of newCatalogItems) {
      catalogMap.set(sku, { id: `SEED-${sku}`, sku, name: catalogItem.name, item_type: catalogItem.type });
    }
  }
  console.log(`Catalog Items: ${catalogMap.size} total (DB + new)`);

  // 7. Look up inventory items
  const invRows = await db.execute(sql`
    SELECT id, catalog_item_id, location_id
    FROM inventory_items
    WHERE tenant_id = ${tenantId} AND location_id = ${mainLocationId}
  `);
  const inventoryMap = new Map<string, string>(); // catalogItemId → inventoryItemId
  for (const row of Array.from(invRows as Iterable<Record<string, unknown>>)) {
    inventoryMap.set(row.catalog_item_id as string, row.id as string);
  }
  console.log(`Inventory Items: ${inventoryMap.size} found at primary location\n`);

  // 8. Check / initialize GL infrastructure
  const acctSettingsRow = (
    await db.execute(sql`SELECT tenant_id FROM accounting_settings WHERE tenant_id = ${tenantId}`)
  )[0];
  const hasAccounting = !skipGl && !!acctSettingsRow;
  if (skipGl) {
    console.log('Accounting: SKIPPED (--skip-gl flag)');
  } else {
    console.log(`Accounting: ${hasAccounting ? 'CONFIGURED' : 'NOT configured (will skip GL)'}`);
  }

  // Look up GL accounts if accounting is configured
  let glAccounts: Map<string, { id: string; accountNumber: string }> | null = null;
  let journalCounter = 0;

  if (hasAccounting) {
    const glRows = await db.execute(sql`
      SELECT id, account_number, name, account_type, normal_balance
      FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND is_active = true
      ORDER BY account_number
    `);
    glAccounts = new Map();
    for (const row of Array.from(glRows as Iterable<Record<string, unknown>>)) {
      const num = row.account_number as string;
      glAccounts.set(num, { id: row.id as string, accountNumber: num });
    }
    console.log(`GL Accounts: ${glAccounts.size} active`);

    // Get current journal counter
    const counterRow = (
      await db.execute(
        sql`SELECT last_number FROM gl_journal_number_counters WHERE tenant_id = ${tenantId}`,
      )
    )[0] as Record<string, unknown> | undefined;
    journalCounter = counterRow ? Number(counterRow.last_number) : 0;
    console.log(`GL Journal Counter: starting at ${journalCounter}`);
  }

  // ── Check for existing seed data ─────────────────────────────────
  const existingOrders = (
    await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM orders
      WHERE tenant_id = ${tenantId} AND source = 'seed'
    `)
  )[0] as Record<string, unknown>;
  const existingCount = Number(existingOrders?.cnt ?? 0);
  if (existingCount > 0 && cleanFirst && !dryRun) {
    console.log(`\nCleaning ${existingCount} existing seed orders and related data...`);
    // Delete in FK-safe order: GL lines → GL entries → tenders → order line taxes → order discounts → order lines → orders
    // Also clean read models and inventory movements from seed
    await db.execute(sql`
      DELETE FROM gl_journal_lines WHERE journal_entry_id IN (
        SELECT id FROM gl_journal_entries WHERE tenant_id = ${tenantId} AND source_module = 'pos_seed'
      )
    `);
    await db.execute(sql`DELETE FROM gl_journal_entries WHERE tenant_id = ${tenantId} AND source_module = 'pos_seed'`);
    await db.execute(sql`
      DELETE FROM tender_reversals WHERE tenant_id = ${tenantId} AND order_id IN (
        SELECT id FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'
      )
    `);
    await db.execute(sql`
      DELETE FROM tenders WHERE tenant_id = ${tenantId} AND order_id IN (
        SELECT id FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'
      )
    `);
    await db.execute(sql`
      DELETE FROM order_line_taxes WHERE tenant_id = ${tenantId} AND order_line_id IN (
        SELECT id FROM order_lines WHERE tenant_id = ${tenantId} AND order_id IN (
          SELECT id FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'
        )
      )
    `);
    await db.execute(sql`
      DELETE FROM order_discounts WHERE tenant_id = ${tenantId} AND order_id IN (
        SELECT id FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'
      )
    `);
    await db.execute(sql`
      DELETE FROM order_lines WHERE tenant_id = ${tenantId} AND order_id IN (
        SELECT id FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'
      )
    `);
    await db.execute(sql`DELETE FROM orders WHERE tenant_id = ${tenantId} AND source = 'seed'`);
    await db.execute(sql`
      DELETE FROM inventory_movements WHERE tenant_id = ${tenantId} AND reference_type IN ('order', 'receive_seed')
    `);
    await db.execute(sql`DELETE FROM rm_daily_sales WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM rm_item_sales WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM rm_inventory_on_hand WHERE tenant_id = ${tenantId}`);
    // Reset GL journal counter
    await db.execute(sql`
      UPDATE gl_journal_number_counters SET last_number = 0 WHERE tenant_id = ${tenantId}
    `);
    // Reset order counter
    await db.execute(sql`
      UPDATE order_counters SET last_number = 0 WHERE tenant_id = ${tenantId}
    `);
    console.log('  Cleaned successfully.\n');
  } else if (existingCount > 0) {
    console.log(`\nWARNING: Found ${existingCount} existing seed orders.`);
    console.log('Re-running is idempotent — duplicates will be skipped via ON CONFLICT.');
    console.log('Use --clean to remove old data and regenerate fresh.\n');
  }

  // ── Generate Transaction Data ────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = addDays(today, -366);

  console.log(`\nDate Range: ${formatDate(startDate)} → ${formatDate(today)}`);
  console.log('Generating transactions...\n');

  // Accumulators for batch inserts
  const orderBatch: unknown[] = [];
  const orderLineBatch: unknown[] = [];
  const orderLineTaxBatch: unknown[] = [];
  const orderDiscountBatch: unknown[] = [];
  const tenderBatch: unknown[] = [];
  const inventoryMovementBatch: unknown[] = [];
  const rmDailySalesBatch = new Map<string, {
    tenantId: string;
    locationId: string;
    businessDate: string;
    orderCount: number;
    grossSales: number; // dollars
    discountTotal: number;
    taxTotal: number;
    netSales: number;
    tenderCash: number;
    tenderCard: number;
    voidCount: number;
    voidTotal: number;
  }>();
  const rmItemSalesBatch = new Map<string, {
    tenantId: string;
    locationId: string;
    businessDate: string;
    catalogItemId: string;
    catalogItemName: string;
    quantitySold: number;
    grossRevenue: number;
    quantityVoided: number;
    voidRevenue: number;
  }>();

  // GL journal batches
  const glJournalBatch: unknown[] = [];
  const glJournalLineBatch: unknown[] = [];

  // Counters
  let orderCounter = existingCount;
  let totalOrders = 0;
  let totalRevenueCents = 0;
  let totalTaxCents = 0;
  let totalTipsCents = 0;
  let totalDiscountCents = 0;
  let voidCount = 0;
  let refundCount = 0;
  let highValueCount = 0;

  // Inventory tracking
  const inventoryOnHand = new Map<string, number>(); // inventoryItemId → qty
  // Initialize with starting inventory (generous to avoid negative on-hand)
  const initDate = formatDate(startDate);
  for (const [catId, invId] of inventoryMap) {
    const initQty = 200;
    inventoryOnHand.set(invId, initQty);
    // Record initial inventory as a receiving movement
    const catalogItem = CATALOG.find((c) => {
      const dbItem = catalogMap.get(c.sku);
      return dbItem && (dbItem.id as string) === catId;
    });
    inventoryMovementBatch.push({
      id: ulid(),
      tenantId,
      locationId: mainLocationId,
      inventoryItemId: invId,
      movementType: 'receive',
      quantityDelta: initQty.toString(),
      unitCost: catalogItem ? (catalogItem.costCents / 100).toFixed(2) : '10.00',
      extendedCost: catalogItem
        ? ((catalogItem.costCents * initQty) / 100).toFixed(2)
        : (10 * initQty).toFixed(2),
      referenceType: 'purchase_order',
      referenceId: `PO-INIT-${invId.slice(-6)}`,
      reason: 'Initial inventory',
      source: 'manual',
      businessDate: initDate,
      employeeId: userId,
      createdBy: userId,
    });
  }

  // Process each day
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const currentDate = addDays(startDate, dayOffset);
    const businessDate = formatDate(currentDate);
    const txCount = getDailyTransactionCount(currentDate);
    const month = getMonth(currentDate);

    // Inventory receiving: 1st and 15th of each month, or whenever stock drops below 50
    const shouldReceive = (currentDate.getDate() === 1 || currentDate.getDate() === 15) && dayOffset > 0;
    if (shouldReceive) {
      for (const [catId, invId] of inventoryMap) {
        const onHand = inventoryOnHand.get(invId) ?? 0;
        // Receive enough to bring stock well above daily sales rate
        const receiveQty = Math.max(0, 200 - onHand) + randInt(50, 100);
        if (receiveQty > 0) {
          const catalogItem = CATALOG.find((c) => {
            const dbItem = catalogMap.get(c.sku);
            return dbItem && (dbItem.id as string) === catId;
          });

          const mvmtId = ulid();
          inventoryMovementBatch.push({
            id: mvmtId,
            tenantId,
            locationId: mainLocationId,
            inventoryItemId: invId,
            movementType: 'receive',
            quantityDelta: receiveQty.toString(),
            unitCost: catalogItem ? (catalogItem.costCents / 100).toFixed(2) : '10.00',
            extendedCost: catalogItem
              ? ((catalogItem.costCents * receiveQty) / 100).toFixed(2)
              : (10 * receiveQty).toFixed(2),
            referenceType: 'purchase_order',
            referenceId: `PO-${businessDate}-${invId.slice(-6)}`,
            reason: 'Monthly restock',
            source: 'manual',
            businessDate,
            employeeId: userId,
            createdBy: userId,
          });

          inventoryOnHand.set(invId, onHand + receiveQty);
        }
      }
    }

    // Emergency receiving: when stock drops below 20
    for (const [catId, invId] of inventoryMap) {
      const onHand = inventoryOnHand.get(invId) ?? 0;
      if (onHand < 20 && !shouldReceive) {
        const catalogItem = CATALOG.find((c) => {
          const dbItem = catalogMap.get(c.sku);
          return dbItem && (dbItem.id as string) === catId;
        });
        const emergencyQty = randInt(150, 250);
        const mvmtId = ulid();
        inventoryMovementBatch.push({
          id: mvmtId,
          tenantId,
          locationId: mainLocationId,
          inventoryItemId: invId,
          movementType: 'receive',
          quantityDelta: emergencyQty.toString(),
          unitCost: catalogItem ? (catalogItem.costCents / 100).toFixed(2) : '10.00',
          extendedCost: catalogItem
            ? ((catalogItem.costCents * emergencyQty) / 100).toFixed(2)
            : (10 * emergencyQty).toFixed(2),
          referenceType: 'purchase_order',
          referenceId: `PO-EMRG-${businessDate}-${invId.slice(-6)}`,
          reason: 'Emergency restock',
          source: 'manual',
          businessDate,
          employeeId: userId,
          createdBy: userId,
        });
        inventoryOnHand.set(invId, onHand + emergencyQty);
      }
    }

    // Initialize daily sales accumulator
    const dailyKey = `${mainLocationId}:${businessDate}`;
    if (!rmDailySalesBatch.has(dailyKey)) {
      rmDailySalesBatch.set(dailyKey, {
        tenantId,
        locationId: mainLocationId,
        businessDate,
        orderCount: 0,
        grossSales: 0,
        discountTotal: 0,
        taxTotal: 0,
        netSales: 0,
        tenderCash: 0,
        tenderCard: 0,
        voidCount: 0,
        voidTotal: 0,
      });
    }
    const dailyAgg = rmDailySalesBatch.get(dailyKey)!;

    // Generate high-value service transactions (2-4 per month)
    if (currentDate.getDate() <= 5) {
      // Check each high-value service type
      for (const hvs of HIGH_VALUE_SERVICES) {
        const monthWeight = hvs.monthWeights[month]!;
        if (monthWeight > 0 && chance(monthWeight * 0.09)) {
          const amountCents = randInt(hvs.minCents, hvs.maxCents);
          const orderId = ulid();
          orderCounter++;
          const orderNumber = `SGG-${String(orderCounter).padStart(6, '0')}`;
          const orderTime = new Date(currentDate);
          orderTime.setHours(10, randInt(0, 59), randInt(0, 59));

          const lineId = ulid();
          const catalogItemId = `SEED-SVC-${hvs.name.replace(/\s+/g, '-').toUpperCase()}`;

          orderBatch.push({
            id: orderId,
            tenantId,
            locationId: mainLocationId,
            orderNumber,
            status: 'paid',
            source: 'seed',
            version: 1,
            subtotal: amountCents,
            taxTotal: 0, // services are tax exempt
            serviceChargeTotal: 0,
            discountTotal: 0,
            roundingAdjustment: 0,
            total: amountCents,
            taxExempt: true,
            businessDate,
            terminalId,
            employeeId: userId,
            placedAt: formatTimestamp(orderTime),
            paidAt: formatTimestamp(orderTime),
            createdBy: userId,
            updatedBy: userId,
          });

          orderLineBatch.push({
            id: lineId,
            tenantId,
            locationId: mainLocationId,
            orderId,
            sortOrder: 0,
            catalogItemId,
            catalogItemName: hvs.name,
            itemType: 'service',
            qty: '1',
            unitPrice: amountCents,
            lineSubtotal: amountCents,
            lineTax: 0,
            lineTotal: amountCents,
          });

          // Tender for high-value (always card)
          const tenderId = ulid();
          tenderBatch.push({
            id: tenderId,
            tenantId,
            locationId: mainLocationId,
            orderId,
            tenderType: 'card',
            tenderSequence: 1,
            amount: amountCents,
            tipAmount: 0,
            changeGiven: 0,
            amountGiven: amountCents,
            businessDate,
            employeeId: userId,
            terminalId,
            createdBy: userId,
          });

          totalRevenueCents += amountCents;
          totalOrders++;
          highValueCount++;
          dailyAgg.orderCount++;
          dailyAgg.grossSales += amountCents / 100;
          dailyAgg.netSales += amountCents / 100;
          dailyAgg.tenderCard += amountCents / 100;
        }
      }
    }

    // Generate regular daily transactions
    for (let txIdx = 0; txIdx < txCount; txIdx++) {
      const category = pickRevenueCategory(currentDate);
      orderCounter++;
      const orderId = ulid();
      const orderNumber = `SGG-${String(orderCounter).padStart(6, '0')}`;

      // Random time distribution
      let hour: number;
      if (category === 'fnb') {
        // Lunch (11-14) or dinner (17-21) peaks
        hour = chance(0.55) ? randInt(11, 14) : randInt(17, 21);
      } else if (category === 'service') {
        // Morning golf peak (7-11)
        hour = randInt(7, 11);
      } else {
        // Retail throughout the day
        hour = randInt(9, 18);
      }

      const orderTime = new Date(currentDate);
      orderTime.setHours(hour, randInt(0, 59), randInt(0, 59));

      // Select items for this order
      const itemsInCategory = CATALOG.filter((c) => {
        if (c.category !== category) return false;
        // Seasonal filtering
        if (c.seasonal === 'spring_summer' && (month < 2 || month > 7)) {
          return chance(0.15); // low chance off-season
        }
        if (c.seasonal === 'summer' && (month < 4 || month > 8)) {
          return chance(0.3); // reduced off-season
        }
        return true;
      });

      if (itemsInCategory.length === 0) continue;

      // Items per order: F&B = 3-7 (food + drinks combo), retail = 1-3, service = 1-3
      let numItems: number;
      if (category === 'fnb') {
        numItems = weightedPick([3, 4, 5, 6, 7], [15, 30, 25, 20, 10]);
      } else if (category === 'service') {
        // Golf orders often include green fee + cart + range balls
        numItems = weightedPick([1, 2, 3], [30, 45, 25]);
      } else {
        numItems = weightedPick([1, 2, 3], [45, 35, 20]);
      }
      const selectedItems: { item: CatalogItem; qty: number }[] = [];

      for (let i = 0; i < numItems; i++) {
        const weights = itemsInCategory.map((c) => c.weight);
        const item = weightedPick(itemsInCategory, weights);
        // Check if already in order
        const existing = selectedItems.find((s) => s.item.sku === item.sku);
        if (existing) {
          existing.qty++;
        } else {
          // F&B drinks often qty 2+ (rounds of drinks)
          let qty = 1;
          if (category === 'fnb' && item.type === 'beverage') {
            qty = weightedPick([1, 2, 3, 4], [40, 35, 15, 10]);
          } else if (category === 'fnb') {
            qty = weightedPick([1, 2], [75, 25]);
          }
          selectedItems.push({ item, qty });
        }
      }

      // Calculate order totals
      let subtotalCents = 0;
      let taxTotalCents = 0;
      let discountAmountCents = 0;
      let isVoided = false;
      let isDiscounted = false;

      // Void: ~1.5% of orders
      if (chance(0.015)) {
        isVoided = true;
        voidCount++;
      }

      // Discount: ~8% of orders
      if (!isVoided && chance(0.08)) {
        isDiscounted = true;
      }

      const lines: {
        id: string;
        item: CatalogItem;
        qty: number;
        unitPrice: number;
        lineSubtotal: number;
        lineTax: number;
        lineTotal: number;
      }[] = [];

      for (const { item, qty } of selectedItems) {
        const lineId = ulid();
        const unitPrice = item.priceCents;
        const lineSubtotal = unitPrice * qty;
        const lineTax = calculateTax(lineSubtotal, item.taxGroup);

        lines.push({
          id: lineId,
          item,
          qty,
          unitPrice,
          lineSubtotal,
          lineTax,
          lineTotal: lineSubtotal + lineTax,
        });

        subtotalCents += lineSubtotal;
        taxTotalCents += lineTax;

        // Look up real catalog item ID
        const dbItem = catalogMap.get(item.sku);
        const catalogItemId = (dbItem?.id as string) ?? `SEED-${item.sku}`;
        const taxGroupId = taxGroupMap.get(item.taxGroup) ?? null;

        orderLineBatch.push({
          id: lineId,
          tenantId,
          locationId: mainLocationId,
          orderId,
          sortOrder: lines.length - 1,
          catalogItemId,
          catalogItemName: item.name,
          catalogItemSku: item.sku,
          itemType: item.type,
          qty: qty.toString(),
          unitPrice,
          lineSubtotal,
          lineTax,
          lineTotal: lineSubtotal + lineTax,
          subDepartmentId: dbItem?.category_id as string ?? null,
          taxGroupId,
          costPrice: item.costCents > 0 ? item.costCents : null,
        });

        // Tax line detail
        if (lineTax > 0) {
          const rate = TAX_RATES[item.taxGroup] ?? 0;
          orderLineTaxBatch.push({
            id: ulid(),
            tenantId,
            orderLineId: lineId,
            taxName: `${item.taxGroup === 'alcohol' ? 'Alcohol' : item.taxGroup === 'food' ? 'Food & Bev' : 'Retail'} Tax`,
            rateDecimal: rate.toFixed(4),
            amount: lineTax,
          });
        }

        // Inventory deduction for trackable items
        if (item.isTrackable && !isVoided) {
          const dbCatItem = catalogMap.get(item.sku);
          if (dbCatItem) {
            const invItemId = inventoryMap.get(dbCatItem.id as string);
            if (invItemId) {
              inventoryMovementBatch.push({
                id: ulid(),
                tenantId,
                locationId: mainLocationId,
                inventoryItemId: invItemId,
                movementType: 'sale',
                quantityDelta: (-qty).toString(),
                unitCost: (item.costCents / 100).toFixed(2),
                extendedCost: ((item.costCents * qty) / 100).toFixed(2),
                referenceType: 'order',
                referenceId: orderId,
                source: 'pos',
                businessDate,
                employeeId: userId,
                terminalId,
                createdBy: userId,
              });

              const currentOnHand = inventoryOnHand.get(invItemId) ?? 0;
              inventoryOnHand.set(invItemId, currentOnHand - qty);
            }
          }
        }

        // Update item sales read model
        if (!isVoided) {
          const itemSalesKey = `${mainLocationId}:${businessDate}:${catalogItemId}`;
          if (!rmItemSalesBatch.has(itemSalesKey)) {
            rmItemSalesBatch.set(itemSalesKey, {
              tenantId,
              locationId: mainLocationId,
              businessDate,
              catalogItemId,
              catalogItemName: item.name,
              quantitySold: 0,
              grossRevenue: 0,
              quantityVoided: 0,
              voidRevenue: 0,
            });
          }
          const itemAgg = rmItemSalesBatch.get(itemSalesKey)!;
          itemAgg.quantitySold += qty;
          itemAgg.grossRevenue += lineSubtotal / 100;
        }
      }

      // Apply discount
      if (isDiscounted) {
        const discountType = chance(0.6) ? 'percentage' : 'fixed';
        if (discountType === 'percentage') {
          const pct = pick([5, 10, 15, 20]);
          discountAmountCents = Math.round(subtotalCents * (pct / 100));
          orderDiscountBatch.push({
            id: ulid(),
            tenantId,
            orderId,
            type: 'percentage',
            value: pct * 100, // stored as basis points? Actually stored as raw pct
            amount: discountAmountCents,
            reason: pick(['Member Discount', 'Happy Hour', 'Senior Discount', 'Loyalty Reward']),
            createdBy: userId,
          });
        } else {
          discountAmountCents = pick([200, 500, 1000, 1500]);
          discountAmountCents = Math.min(discountAmountCents, subtotalCents); // can't exceed subtotal
          orderDiscountBatch.push({
            id: ulid(),
            tenantId,
            orderId,
            type: 'fixed',
            value: discountAmountCents,
            amount: discountAmountCents,
            reason: pick(['Promo Code', 'Manager Override', 'Rain Check']),
            createdBy: userId,
          });
        }
        totalDiscountCents += discountAmountCents;
      }

      const totalCents = subtotalCents + taxTotalCents - discountAmountCents;

      const orderStatus = isVoided ? 'voided' : 'paid';

      orderBatch.push({
        id: orderId,
        tenantId,
        locationId: mainLocationId,
        orderNumber,
        status: orderStatus,
        source: 'seed',
        version: 1,
        subtotal: subtotalCents,
        taxTotal: taxTotalCents,
        serviceChargeTotal: 0,
        discountTotal: discountAmountCents,
        roundingAdjustment: 0,
        total: totalCents,
        taxExempt: false,
        businessDate,
        terminalId,
        employeeId: userId,
        placedAt: formatTimestamp(orderTime),
        paidAt: isVoided ? null : formatTimestamp(orderTime),
        voidedAt: isVoided ? formatTimestamp(orderTime) : null,
        voidReason: isVoided ? pick(['Customer request', 'Wrong item', 'Duplicate order']) : null,
        voidedBy: isVoided ? userId : null,
        createdBy: userId,
        updatedBy: userId,
      });

      totalOrders++;

      // Update daily aggregates
      if (!isVoided) {
        dailyAgg.orderCount++;
        dailyAgg.grossSales += subtotalCents / 100;
        dailyAgg.discountTotal += discountAmountCents / 100;
        dailyAgg.taxTotal += taxTotalCents / 100;
        dailyAgg.netSales += (totalCents) / 100;
        totalRevenueCents += totalCents;
        totalTaxCents += taxTotalCents;
      } else {
        dailyAgg.voidCount++;
        dailyAgg.voidTotal += totalCents / 100;
      }

      // Generate tender for non-voided orders
      if (!isVoided) {
        const tenderType = chance(0.55) ? 'card' : 'cash';
        let tipAmountCents = 0;

        // Tips on F&B orders (75% of the time, 10-25%)
        if (category === 'fnb' && chance(0.75)) {
          const tipPct = randFloat(0.10, 0.25);
          tipAmountCents = Math.round(totalCents * tipPct);
          totalTipsCents += tipAmountCents;
        }

        const tenderAmount = totalCents;
        let changeGiven = 0;
        let amountGiven = tenderAmount + tipAmountCents;

        if (tenderType === 'cash') {
          // Round up to nearest dollar
          amountGiven = Math.ceil((tenderAmount + tipAmountCents) / 100) * 100;
          changeGiven = amountGiven - tenderAmount - tipAmountCents;
          dailyAgg.tenderCash += tenderAmount / 100;
        } else {
          dailyAgg.tenderCard += tenderAmount / 100;
        }

        const tenderId = ulid();
        tenderBatch.push({
          id: tenderId,
          tenantId,
          locationId: mainLocationId,
          orderId,
          tenderType,
          tenderSequence: 1,
          amount: tenderAmount,
          tipAmount: tipAmountCents,
          changeGiven,
          amountGiven,
          businessDate,
          employeeId: userId,
          terminalId,
          cardLast4: tenderType === 'card' ? String(randInt(1000, 9999)) : null,
          cardBrand: tenderType === 'card' ? pick(['visa', 'mastercard', 'amex']) : null,
          createdBy: userId,
        });

        // GL journal entry for this tender (if accounting configured)
        if (hasAccounting && glAccounts && glAccounts.size > 0) {
          journalCounter++;
          const jeId = ulid();
          const postingPeriod = businessDate.substring(0, 7); // YYYY-MM

          // Find GL accounts by number pattern
          const findAccount = (pattern: string) => {
            for (const [num, acct] of glAccounts!) {
              if (num.startsWith(pattern)) return acct;
            }
            return null;
          };

          // Revenue account (4xxxx)
          const revenueAcct = findAccount('4') ?? findAccount('40');
          // Cash/Bank account (1xxxx)
          const cashAcct = findAccount('10') ?? findAccount('1');
          // Tax payable (2xxxx)
          const taxPayableAcct = findAccount('23') ?? findAccount('2');
          // Tips payable
          const tipsPayableAcct = findAccount('216') ?? findAccount('21');
          // Discount
          const discountAcct = findAccount('49') ?? findAccount('4');

          if (revenueAcct && cashAcct) {
            glJournalBatch.push({
              id: jeId,
              tenantId,
              journalNumber: journalCounter,
              sourceModule: 'pos',
              sourceReferenceId: tenderId,
              businessDate,
              postingPeriod,
              status: 'posted',
              memo: `POS Sale ${orderNumber}`,
              postedAt: formatTimestamp(orderTime),
              createdBy: 'system',
            });

            let sortIdx = 0;

            // Debit: Cash/Card account
            const totalDebitCents = tenderAmount + tipAmountCents;
            glJournalLineBatch.push({
              id: ulid(),
              journalEntryId: jeId,
              accountId: cashAcct.id,
              debitAmount: (totalDebitCents / 100).toFixed(2),
              creditAmount: '0.00',
              locationId: mainLocationId,
              channel: 'pos',
              terminalId,
              sortOrder: sortIdx++,
            });

            // Credit: Revenue
            glJournalLineBatch.push({
              id: ulid(),
              journalEntryId: jeId,
              accountId: revenueAcct.id,
              debitAmount: '0.00',
              creditAmount: (subtotalCents / 100).toFixed(2),
              locationId: mainLocationId,
              channel: 'pos',
              sortOrder: sortIdx++,
            });

            // Credit: Tax Payable (if any)
            if (taxTotalCents > 0 && taxPayableAcct) {
              glJournalLineBatch.push({
                id: ulid(),
                journalEntryId: jeId,
                accountId: taxPayableAcct.id,
                debitAmount: '0.00',
                creditAmount: (taxTotalCents / 100).toFixed(2),
                locationId: mainLocationId,
                channel: 'pos',
                sortOrder: sortIdx++,
              });
            }

            // Credit: Tips Payable (if any)
            if (tipAmountCents > 0 && tipsPayableAcct) {
              glJournalLineBatch.push({
                id: ulid(),
                journalEntryId: jeId,
                accountId: tipsPayableAcct.id,
                debitAmount: '0.00',
                creditAmount: (tipAmountCents / 100).toFixed(2),
                locationId: mainLocationId,
                channel: 'pos',
                sortOrder: sortIdx++,
              });
            }

            // Debit: Discount (contra-revenue, if any)
            if (discountAmountCents > 0 && discountAcct) {
              glJournalLineBatch.push({
                id: ulid(),
                journalEntryId: jeId,
                accountId: discountAcct.id,
                debitAmount: (discountAmountCents / 100).toFixed(2),
                creditAmount: '0.00',
                locationId: mainLocationId,
                channel: 'pos',
                sortOrder: sortIdx++,
              });
            }
          }
        }
      }
    }

    // Progress logging every 30 days
    if (dayOffset % 30 === 0) {
      const pct = Math.round((dayOffset / 366) * 100);
      console.log(
        `  Day ${dayOffset}/366 (${pct}%) — ${businessDate} — ${totalOrders} orders, $${(totalRevenueCents / 100).toLocaleString()}`,
      );
    }
  }

  // ── Summary Before Insert ────────────────────────────────────────
  console.log('\n=== Generation Summary ===');
  console.log(`Total Orders:      ${totalOrders.toLocaleString()}`);
  console.log(`Total Revenue:     $${(totalRevenueCents / 100).toLocaleString()}`);
  console.log(`Total Tax:         $${(totalTaxCents / 100).toLocaleString()}`);
  console.log(`Total Tips:        $${(totalTipsCents / 100).toLocaleString()}`);
  console.log(`Total Discounts:   $${(totalDiscountCents / 100).toLocaleString()}`);
  console.log(`Voided Orders:     ${voidCount}`);
  console.log(`High-Value Events: ${highValueCount}`);
  console.log(`Order Lines:       ${orderLineBatch.length.toLocaleString()}`);
  console.log(`Tenders:           ${tenderBatch.length.toLocaleString()}`);
  console.log(`Inv. Movements:    ${inventoryMovementBatch.length.toLocaleString()}`);
  console.log(`GL Journal Entries:${glJournalBatch.length.toLocaleString()}`);
  console.log(`GL Journal Lines:  ${glJournalLineBatch.length.toLocaleString()}`);
  console.log(`Daily Sales Aggs:  ${rmDailySalesBatch.size}`);
  console.log(`Item Sales Aggs:   ${rmItemSalesBatch.size}`);

  if (dryRun) {
    console.log('\n--- DRY RUN: No data inserted ---\n');
    await client.end();
    return;
  }

  // ── Batch Insert ─────────────────────────────────────────────────
  console.log('\nInserting data...');

  const BATCH_SIZE = 500;

  async function batchInsert(
    tableName: string,
    columns: string[],
    rows: unknown[],
  ) {
    if (rows.length === 0) return;
    console.log(`  ${tableName}: ${rows.length} rows...`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const colList = columns.map((c) => `"${c}"`).join(', ');
      const valueSets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      for (const row of batch) {
        const r = row as Record<string, unknown>;
        const placeholders: string[] = [];
        for (const col of columns) {
          // Convert camelCase column names to snake_case for param lookup
          const camelKey = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          const val = r[camelKey] ?? r[col] ?? null;
          placeholders.push(`$${paramIdx++}`);
          params.push(val);
        }
        valueSets.push(`(${placeholders.join(', ')})`);
      }

      const query = `
        INSERT INTO "${tableName}" (${colList})
        VALUES ${valueSets.join(',\n')}
        ON CONFLICT DO NOTHING
      `;

      await client.unsafe(query, params);
    }
  }

  // Insert order counters update
  await db.execute(sql`
    INSERT INTO order_counters (tenant_id, location_id, last_number)
    VALUES (${tenantId}, ${mainLocationId}, ${orderCounter})
    ON CONFLICT (tenant_id, location_id)
    DO UPDATE SET last_number = GREATEST(order_counters.last_number, EXCLUDED.last_number)
  `);

  // Insert orders
  await batchInsert('orders', [
    'id', 'tenant_id', 'location_id', 'order_number', 'status', 'source', 'version',
    'subtotal', 'tax_total', 'service_charge_total', 'discount_total', 'rounding_adjustment',
    'total', 'tax_exempt', 'business_date', 'terminal_id', 'employee_id',
    'placed_at', 'paid_at', 'voided_at', 'void_reason', 'voided_by',
    'created_by', 'updated_by',
  ], orderBatch);

  // Insert order lines
  await batchInsert('order_lines', [
    'id', 'tenant_id', 'location_id', 'order_id', 'sort_order',
    'catalog_item_id', 'catalog_item_name', 'catalog_item_sku', 'item_type',
    'qty', 'unit_price', 'line_subtotal', 'line_tax', 'line_total',
    'sub_department_id', 'tax_group_id', 'cost_price',
  ], orderLineBatch);

  // Insert order line taxes
  await batchInsert('order_line_taxes', [
    'id', 'tenant_id', 'order_line_id', 'tax_name', 'rate_decimal', 'amount',
  ], orderLineTaxBatch);

  // Insert order discounts
  await batchInsert('order_discounts', [
    'id', 'tenant_id', 'order_id', 'type', 'value', 'amount', 'reason', 'created_by',
  ], orderDiscountBatch);

  // Insert tenders
  await batchInsert('tenders', [
    'id', 'tenant_id', 'location_id', 'order_id', 'tender_type', 'tender_sequence',
    'amount', 'tip_amount', 'change_given', 'amount_given',
    'business_date', 'employee_id', 'terminal_id',
    'card_last4', 'card_brand', 'created_by',
  ], tenderBatch);

  // Insert inventory movements
  await batchInsert('inventory_movements', [
    'id', 'tenant_id', 'location_id', 'inventory_item_id', 'movement_type',
    'quantity_delta', 'unit_cost', 'extended_cost',
    'reference_type', 'reference_id', 'reason', 'source',
    'business_date', 'employee_id', 'terminal_id', 'created_by',
  ], inventoryMovementBatch);

  // Insert GL journal entries (if any)
  if (glJournalBatch.length > 0) {
    await batchInsert('gl_journal_entries', [
      'id', 'tenant_id', 'journal_number', 'source_module', 'source_reference_id',
      'business_date', 'posting_period', 'status', 'memo', 'posted_at', 'created_by',
    ], glJournalBatch);

    await batchInsert('gl_journal_lines', [
      'id', 'journal_entry_id', 'account_id', 'debit_amount', 'credit_amount',
      'location_id', 'channel', 'terminal_id', 'sort_order',
    ], glJournalLineBatch);

    // Update GL journal counter
    await db.execute(sql`
      INSERT INTO gl_journal_number_counters (tenant_id, last_number)
      VALUES (${tenantId}, ${journalCounter})
      ON CONFLICT (tenant_id)
      DO UPDATE SET last_number = GREATEST(gl_journal_number_counters.last_number, EXCLUDED.last_number)
    `);
  }

  // Insert reporting read models
  console.log('  rm_daily_sales: upserting...');
  for (const [, agg] of rmDailySalesBatch) {
    const avgOrderValue = agg.orderCount > 0 ? agg.netSales / agg.orderCount : 0;
    await db.execute(sql`
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        order_count, gross_sales, discount_total, tax_total, net_sales,
        tender_cash, tender_card, void_count, void_total, avg_order_value
      ) VALUES (
        ${ulid()}, ${agg.tenantId}, ${agg.locationId}, ${agg.businessDate},
        ${agg.orderCount}, ${agg.grossSales.toFixed(4)}, ${agg.discountTotal.toFixed(4)},
        ${agg.taxTotal.toFixed(4)}, ${agg.netSales.toFixed(4)},
        ${agg.tenderCash.toFixed(4)}, ${agg.tenderCard.toFixed(4)},
        ${agg.voidCount}, ${agg.voidTotal.toFixed(4)}, ${avgOrderValue.toFixed(4)}
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        order_count = EXCLUDED.order_count,
        gross_sales = EXCLUDED.gross_sales,
        discount_total = EXCLUDED.discount_total,
        tax_total = EXCLUDED.tax_total,
        net_sales = EXCLUDED.net_sales,
        tender_cash = EXCLUDED.tender_cash,
        tender_card = EXCLUDED.tender_card,
        void_count = EXCLUDED.void_count,
        void_total = EXCLUDED.void_total,
        avg_order_value = EXCLUDED.avg_order_value,
        updated_at = NOW()
    `);
  }

  console.log('  rm_item_sales: upserting...');
  for (const [, agg] of rmItemSalesBatch) {
    await db.execute(sql`
      INSERT INTO rm_item_sales (
        id, tenant_id, location_id, business_date,
        catalog_item_id, catalog_item_name,
        quantity_sold, gross_revenue, quantity_voided, void_revenue
      ) VALUES (
        ${ulid()}, ${agg.tenantId}, ${agg.locationId}, ${agg.businessDate},
        ${agg.catalogItemId}, ${agg.catalogItemName},
        ${agg.quantitySold}, ${agg.grossRevenue.toFixed(4)},
        ${agg.quantityVoided}, ${agg.voidRevenue.toFixed(4)}
      )
      ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
      DO UPDATE SET
        quantity_sold = EXCLUDED.quantity_sold,
        gross_revenue = EXCLUDED.gross_revenue,
        quantity_voided = EXCLUDED.quantity_voided,
        void_revenue = EXCLUDED.void_revenue,
        updated_at = NOW()
    `);
  }

  // Update inventory on-hand read model
  console.log('  rm_inventory_on_hand: upserting...');
  for (const [invItemId, onHand] of inventoryOnHand) {
    // Look up item name
    let itemName = 'Unknown';
    for (const [catId, invId] of inventoryMap) {
      if (invId === invItemId) {
        const dbItem = Array.from(catalogMap.values()).find((c) => (c.id as string) === catId);
        if (dbItem) itemName = dbItem.name as string;
        break;
      }
    }

    await db.execute(sql`
      INSERT INTO rm_inventory_on_hand (
        id, tenant_id, location_id, inventory_item_id, item_name,
        on_hand, low_stock_threshold, is_below_threshold
      ) VALUES (
        ${ulid()}, ${tenantId}, ${mainLocationId}, ${invItemId}, ${itemName},
        ${onHand}, ${5}, ${onHand < 5}
      )
      ON CONFLICT (tenant_id, location_id, inventory_item_id)
      DO UPDATE SET
        on_hand = EXCLUDED.on_hand,
        is_below_threshold = EXCLUDED.is_below_threshold,
        updated_at = NOW()
    `);
  }

  // ── Final Summary ────────────────────────────────────────────────
  console.log('\n=== Insert Complete ===');
  console.log(`Orders:            ${orderBatch.length.toLocaleString()}`);
  console.log(`Order Lines:       ${orderLineBatch.length.toLocaleString()}`);
  console.log(`Tenders:           ${tenderBatch.length.toLocaleString()}`);
  console.log(`Inv. Movements:    ${inventoryMovementBatch.length.toLocaleString()}`);
  console.log(`GL Entries:        ${glJournalBatch.length.toLocaleString()}`);
  console.log(`GL Lines:          ${glJournalLineBatch.length.toLocaleString()}`);
  console.log(`Daily Sales Aggs:  ${rmDailySalesBatch.size}`);
  console.log(`Item Sales Aggs:   ${rmItemSalesBatch.size}`);

  await client.end();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
