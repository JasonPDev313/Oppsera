import dotenv from 'dotenv';

// --remote flag loads .env.remote first so seed targets production Supabase
const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '../../.env.remote', override: true });
}
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';
import {
  tenants,
  orders,
  orderLines,
  orderLineTaxes,
  orderCounters,
  tenders,
  rmDailySales,
  rmRevenueActivity,
} from './schema';

// ══════════════════════════════════════════════════════════════
// ══ CONFIGURATION ════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

const DAYS_BACK = 366;
const VOID_RATE = 0.08;
const CASH_RATIO = 0.33;
const CUSTOMER_ASSIGN_RATE = 0.40;

// Seasonal base revenue per day (in dollars)
// Targets ~$1M total: 366 days × ~$2,730/day avg
// Actual avg order ~$98 → ~10,200 paid orders → ~11,100 total
const SEASON_BASE: Record<string, number> = {
  summer: 4000,   // Jun-Aug: peak golf season
  shoulder: 2800, // Apr-May, Sep-Oct
  winter: 1700,   // Nov-Mar: off-season
};

// Tournament days — scattered through the year (day offsets from start)
const TOURNAMENT_DAYS = new Set([45, 120, 180, 240, 310]);

// Tax rates (matching seed.ts)
const RETAIL_TAX_RATE = 0.075;
const FOOD_TAX_RATE = 0.0825;
const ALCOHOL_TAX_RATE = 0.0825;

// ══════════════════════════════════════════════════════════════
// ══ HELPERS ═══════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

// Seeded PRNG for deterministic generation
function mulberry32(seed: number) {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260224); // deterministic seed

function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}

function getSeason(month: number): string {
  if (month >= 5 && month <= 7) return 'summer'; // Jun-Aug (0-indexed)
  if (month === 3 || month === 4 || month === 8 || month === 9) return 'shoulder';
  return 'winter';
}

function bizDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pastTimestamp(baseDate: Date, hourOfDay: number): Date {
  const d = new Date(baseDate);
  d.setHours(hourOfDay, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return d;
}

// ══════════════════════════════════════════════════════════════
// ══ MAIN ═════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

async function seedYear() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`\n══ Year Seed: 366 days of transactions ══`);
  console.log(`Target: ${target} (${masked})`);
  console.log(`Mode: ADDITIVE ONLY — no deletes, truncates, or drops\n`);

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    // ── 1. Query existing data ──────────────────────────────
    console.log('── Querying existing data...');

    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) throw new Error('No tenant found. Run pnpm db:seed first.');
    const tenantId = tenant.id;
    console.log(`  Tenant: ${tenant.name} (${tenantId})`);

    // Get venues (not sites) — venues are the actual selling locations
    const allLocs = await db.execute(sql`
      SELECT id, name, location_type, parent_location_id FROM locations WHERE tenant_id = ${tenantId} ORDER BY name
    `) as Array<{ id: string; name: string; location_type: string | null; parent_location_id: string | null }>;
    // Prefer venues; fall back to all locations if no hierarchy
    const venues = allLocs.filter(l => l.location_type === 'venue');
    const locs = venues.length >= 2 ? venues : allLocs;
    if (locs.length < 2) throw new Error('Need at least 2 locations. Run pnpm db:seed first.');
    const locationIds = locs.map(l => l.id);
    console.log(`  Locations: ${locs.map(l => `${l.name} (${l.id})`).join(', ')}`);

    const userRows = await db.execute(sql`
      SELECT id, email, display_name FROM users WHERE tenant_id = ${tenantId} LIMIT 1
    `) as Array<{ id: string; email: string; display_name: string | null }>;
    if (userRows.length === 0) throw new Error('No user found. Run pnpm db:seed first.');
    const userId = userRows[0]!.id;
    const userName = userRows[0]!.display_name ?? userRows[0]!.email;
    console.log(`  User: ${userRows[0]!.email} (${userId})`);

    const terminalRows = await db.execute(sql`
      SELECT id FROM terminals LIMIT 10
    `) as Array<{ id: string }>;
    const terminalIds = terminalRows.length >= 2
      ? [terminalRows[0]!.id, terminalRows[1]!.id]
      : [null, null];
    console.log(`  Terminals: ${terminalRows.length} found`);

    const custRows = await db.execute(sql`
      SELECT id, display_name FROM customers WHERE tenant_id = ${tenantId} LIMIT 10
    `) as Array<{ id: string; display_name: string | null }>;
    const customerPool = [...custRows.map(c => ({ id: c.id, name: c.display_name })), null, null, null];
    console.log(`  Customers: ${custRows.length} found`);

    // Get catalog items with their categories (raw SQL to avoid Drizzle reference issues)
    const items = await db.execute(sql`
      SELECT id, name, sku, item_type, default_price, category_id
      FROM catalog_items WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string; sku: string | null; item_type: string | null; default_price: string | null; category_id: string | null }>;

    if (items.length === 0) throw new Error('No catalog items found. Run pnpm db:seed first.');

    // Get categories for names
    const cats = await db.execute(sql`
      SELECT id, name, parent_id FROM catalog_categories WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string; parent_id: string | null }>;
    const catMap = new Map(cats.map(c => [c.id, { id: c.id, name: c.name, parentId: c.parent_id }]));

    // Build orderable items (matching seed.ts structure)
    const orderableItems = items.map(item => {
      const priceCents = Math.round(parseFloat(item.default_price ?? '0') * 100);
      const cat = item.category_id ? catMap.get(item.category_id) : null;
      const catName = cat?.name ?? 'General';
      // Resolve sub-department: COALESCE(parentId, id)
      const subDeptId = cat?.parentId ?? cat?.id ?? null;

      // Determine tax rate based on item type
      let taxRate = 0;
      const t = item.item_type ?? 'retail';
      if (t === 'retail') taxRate = RETAIL_TAX_RATE;
      else if (t === 'food') taxRate = FOOD_TAX_RATE;
      else if (t === 'beverage') taxRate = ALCOHOL_TAX_RATE;
      // green_fee, rental, service = 0

      return {
        id: item.id,
        name: item.name,
        sku: item.sku ?? 'ITEM',
        type: t,
        priceCents,
        taxRate,
        catName,
        catId: subDeptId,
      };
    });

    console.log(`  Catalog items: ${orderableItems.length} (${orderableItems.map(i => `${i.name}=$${(i.priceCents/100).toFixed(2)}`).join(', ')})`);

    // Build order templates from available items
    // Target avg order ~$100-$120 to hit $800K-$1.2M with ~9,000 orders
    const foodItems = orderableItems.filter(i => i.type === 'food' || i.type === 'beverage');
    const retailItems = orderableItems.filter(i => i.type === 'retail');
    const greenFeeItems = orderableItems.filter(i => i.type === 'green_fee');
    const rentalItems = orderableItems.filter(i => i.type === 'rental');

    type OrderTemplate = { items: Array<{ itemIdx: number; qty: number }>; weight: number };
    const orderTemplates: OrderTemplate[] = [];

    const indexOf = (item: typeof orderableItems[0]) => orderableItems.indexOf(item);

    // ── High-value golf combos (weight these heavily) ──
    for (const gf of greenFeeItems) {
      const gfIdx = indexOf(gf);
      // Golf + cart + food + drinks ($75+$25+$15+$16 = $131)
      if (rentalItems.length > 0 && foodItems.length >= 2) {
        const r = indexOf(rentalItems[0]!);
        const f0 = indexOf(foodItems[0]!);
        const f1 = indexOf(foodItems[foodItems.length - 1]!);
        orderTemplates.push({ items: [
          { itemIdx: gfIdx, qty: 1 }, { itemIdx: r, qty: 1 },
          { itemIdx: f0, qty: 1 }, { itemIdx: f1, qty: 2 },
        ], weight: 5 }); // Heavy weight — most common
      }
      // Golf + cart ($75+$25 = $100)
      if (rentalItems.length > 0) {
        const r = indexOf(rentalItems[0]!);
        orderTemplates.push({ items: [{ itemIdx: gfIdx, qty: 1 }, { itemIdx: r, qty: 1 }], weight: 4 });
      }
      // Golf + food ($75+$15 = $90)
      if (foodItems.length > 0) {
        const f = indexOf(foodItems[Math.floor(rand() * foodItems.length)]!);
        orderTemplates.push({ items: [{ itemIdx: gfIdx, qty: 1 }, { itemIdx: f, qty: 1 }], weight: 3 });
      }
    }

    // ── Foursome golf combos (high-value) ──
    for (const gf of greenFeeItems) {
      const gfIdx = indexOf(gf);
      // 2x golf + 2x cart + drinks ($75*2+$25*2+$8*4 = $232)
      if (rentalItems.length > 0 && foodItems.length > 0) {
        const r = indexOf(rentalItems[0]!);
        const bev = indexOf(foodItems[foodItems.length - 1]!);
        orderTemplates.push({ items: [
          { itemIdx: gfIdx, qty: 2 }, { itemIdx: r, qty: 2 }, { itemIdx: bev, qty: 4 },
        ], weight: 3 });
      }
    }

    // ── Big day: golf + retail + full lunch ──
    if (greenFeeItems.length > 0 && retailItems.length > 0 && foodItems.length >= 2) {
      const gf = indexOf(greenFeeItems[0]!);
      const rt = indexOf(retailItems[0]!);
      const fd = indexOf(foodItems[0]!);
      const bv = indexOf(foodItems[foodItems.length - 1]!);
      const r = rentalItems.length > 0 ? indexOf(rentalItems[0]!) : -1;
      const items = [
        { itemIdx: gf, qty: 1 }, { itemIdx: rt, qty: 1 },
        { itemIdx: fd, qty: 2 }, { itemIdx: bv, qty: 3 },
      ];
      if (r >= 0) items.push({ itemIdx: r, qty: 1 });
      orderTemplates.push({ items, weight: 2 });
    }

    // ── Retail combos ──
    if (retailItems.length >= 2) {
      const r0 = indexOf(retailItems[0]!);
      const r1 = indexOf(retailItems[1]!);
      orderTemplates.push({ items: [{ itemIdx: r0, qty: 1 }, { itemIdx: r1, qty: 1 }], weight: 2 });
    }
    for (const ri of retailItems) {
      orderTemplates.push({ items: [{ itemIdx: indexOf(ri), qty: 1 }], weight: 1 });
    }

    // ── Food combos (lower value, less weight) ──
    if (foodItems.length >= 2) {
      const f0 = indexOf(foodItems[0]!);
      const f1 = indexOf(foodItems[1]!);
      orderTemplates.push({ items: [{ itemIdx: f0, qty: 2 }, { itemIdx: f1, qty: 2 }], weight: 2 });
    }
    for (const fi of foodItems) {
      orderTemplates.push({ items: [{ itemIdx: indexOf(fi), qty: 1 }], weight: 1 });
    }

    if (orderTemplates.length === 0) {
      orderableItems.forEach((_, idx) => {
        orderTemplates.push({ items: [{ itemIdx: idx, qty: 1 }], weight: 1 });
      });
    }

    // Build weighted selection array
    const weightedTemplates: OrderTemplate[] = [];
    for (const t of orderTemplates) {
      for (let w = 0; w < t.weight; w++) {
        weightedTemplates.push(t);
      }
    }

    console.log(`  Order templates: ${orderTemplates.length} combos`);

    // Compute weighted average order value for planning
    let templateTotalCents = 0;
    for (const t of weightedTemplates) {
      for (const li of t.items) {
        const item = orderableItems[li.itemIdx]!;
        templateTotalCents += item.priceCents * li.qty;
      }
    }
    const avgOrderCents = Math.round(templateTotalCents / weightedTemplates.length);
    console.log(`  Weighted templates: ${weightedTemplates.length} (from ${orderTemplates.length} unique)`);
    console.log(`  Avg weighted template value: $${(avgOrderCents / 100).toFixed(2)}`);

    // ── 2. Get existing order counters (use MAX from orders table for safety) ──
    const existingCounters = await db.select().from(orderCounters)
      .where(eq(orderCounters.tenantId, tenantId));
    const orderNumberCounters: Record<string, number> = {};
    for (const loc of locationIds) {
      const counterRow = existingCounters.find(c => c.locationId === loc);
      // Also check actual max order number in orders table (in case counter is stale)
      const [maxRow] = await db.execute(sql`
        SELECT MAX(CAST(REPLACE(order_number, 'ORD-', '') AS INTEGER)) as max_num
        FROM orders WHERE tenant_id = ${tenantId} AND location_id = ${loc}
      `) as Array<{ max_num: number | null }>;
      const fromCounter = counterRow ? counterRow.lastNumber : 0;
      const fromOrders = maxRow?.max_num ?? 0;
      orderNumberCounters[loc] = Math.max(fromCounter, fromOrders);
    }
    console.log(`  Order counters: ${JSON.stringify(orderNumberCounters)}`);

    // Check existing order count
    const existingCountResult = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(orders).where(eq(orders.tenantId, tenantId));
    const existingOrderCount = existingCountResult[0]?.count ?? 0;
    console.log(`  Existing orders: ${existingOrderCount}`);

    // ── 3. Generate 366 days of orders ─────────────────────────
    console.log('\n── Generating orders...');

    const allOrderInserts: Array<Record<string, unknown>> = [];
    const allLineInserts: Array<Record<string, unknown>> = [];
    const allTaxInserts: Array<Record<string, unknown>> = [];
    const allTenderInserts: Array<Record<string, unknown>> = [];
    const allActivityInserts: Array<Record<string, unknown>> = [];

    // Aggregation trackers
    const dailyAgg: Record<string, {
      orderCount: number; grossSales: number; taxTotal: number; netSales: number;
      discountTotal: number; tenderCash: number; tenderCard: number;
      tenderGiftCard: number; tenderHouseAccount: number; tenderAch: number; tenderOther: number;
      tipTotal: number; serviceChargeTotal: number; surchargeTotal: number; returnTotal: number;
      voidCount: number; voidTotal: number; locationId: string;
    }> = {};
    const itemAgg: Record<string, {
      catalogItemId: string; catalogItemName: string; categoryName: string;
      quantitySold: number; grossRevenue: number; locationId: string;
    }> = {};

    let totalRevenueCents = 0;
    let totalOrderCount = 0;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DAYS_BACK);

    for (let dayOffset = 0; dayOffset < DAYS_BACK; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + dayOffset);
      const bd = bizDate(currentDate);
      const month = currentDate.getMonth();
      const dayOfWeek = currentDate.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Calculate daily target revenue
      const season = getSeason(month);
      const baseRevenue = SEASON_BASE[season]!;
      const weekendMult = isWeekend ? 1.4 : 1.0;
      const noise = randBetween(0.7, 1.3);
      const isTournament = TOURNAMENT_DAYS.has(dayOffset);
      const tournamentMult = isTournament ? randBetween(3.5, 5.0) : 1.0;

      let dailyTargetDollars = baseRevenue * weekendMult * noise * tournamentMult;
      dailyTargetDollars = Math.max(2000, Math.min(25000, dailyTargetDollars));
      const dailyTargetCents = Math.round(dailyTargetDollars * 100);

      // Determine number of orders to hit daily revenue target
      // ~20,000 total orders across 366 days is acceptable
      const ordersThisDay = Math.max(5, Math.min(200, Math.ceil(dailyTargetCents / avgOrderCents)));

      for (let orderIdx = 0; orderIdx < ordersThisDay; orderIdx++) {
        // Location split: 70% main, 30% secondary
        const isMain = rand() < 0.70;
        const locId = isMain ? locationIds[0]! : locationIds[1]!;
        const termId = isMain ? terminalIds[0] : terminalIds[1];

        // Pick template (weighted selection)
        const templateIdx = Math.floor(rand() * weightedTemplates.length);
        const template = weightedTemplates[templateIdx]!;

        // Occasionally void (~8%)
        const isVoided = rand() < VOID_RATE;

        // Customer assignment (~40%)
        const custIdx = Math.floor(rand() * customerPool.length);
        const custEntry = rand() < CUSTOMER_ASSIGN_RATE ? customerPool[custIdx] ?? null : null;
        const custId = custEntry?.id ?? null;
        const custName = custEntry?.name ?? null;

        // Order number
        orderNumberCounters[locId]!++;
        const orderNum = `ORD-${String(orderNumberCounters[locId]).padStart(5, '0')}`;

        const orderId = generateUlid();
        const hourOfDay = 7 + Math.floor(rand() * 13); // 7am-7pm
        const ts = pastTimestamp(currentDate, hourOfDay);

        let orderSubtotal = 0;
        let orderTaxTotal = 0;
        let sortOrder = 0;

        // Create line items
        for (const lineSpec of template.items) {
          const item = orderableItems[lineSpec.itemIdx]!;
          const lineId = generateUlid();
          const lineSubtotal = item.priceCents * lineSpec.qty;
          const lineTax = Math.round(lineSubtotal * item.taxRate);
          const lineTotal = lineSubtotal + lineTax;

          orderSubtotal += lineSubtotal;
          orderTaxTotal += lineTax;

          allLineInserts.push({
            id: lineId,
            tenantId,
            locationId: locId,
            orderId,
            sortOrder: sortOrder++,
            catalogItemId: item.id,
            catalogItemName: item.name,
            catalogItemSku: item.sku,
            itemType: item.type,
            qty: String(lineSpec.qty),
            unitPrice: item.priceCents,
            lineSubtotal,
            lineTax,
            lineTotal,
            subDepartmentId: item.catId,
            taxGroupId: null,
            createdAt: ts,
          });

          // Tax breakdown
          if (item.taxRate > 0) {
            allTaxInserts.push({
              tenantId,
              orderLineId: lineId,
              taxName: item.type === 'retail' ? 'Retail Sales Tax' : 'Food & Bev Tax',
              rateDecimal: item.taxRate.toFixed(4),
              amount: lineTax,
            });
          }

          // Item aggregation
          const itemAggKey = `${bd}|${locId}|${item.id}`;
          if (!itemAgg[itemAggKey]) {
            itemAgg[itemAggKey] = {
              catalogItemId: item.id,
              catalogItemName: item.name,
              categoryName: item.catName,
              quantitySold: 0,
              grossRevenue: 0,
              locationId: locId,
            };
          }
          if (!isVoided) {
            itemAgg[itemAggKey]!.quantitySold += lineSpec.qty;
            itemAgg[itemAggKey]!.grossRevenue += lineSubtotal / 100;
          }
        }

        const orderTotal = orderSubtotal + orderTaxTotal;
        const status = isVoided ? 'voided' : 'paid';

        allOrderInserts.push({
          id: orderId,
          tenantId,
          locationId: locId,
          orderNumber: orderNum,
          status,
          source: 'pos',
          version: 1,
          customerId: custId,
          subtotal: orderSubtotal,
          taxTotal: orderTaxTotal,
          discountTotal: 0,
          serviceChargeTotal: 0,
          roundingAdjustment: 0,
          total: orderTotal,
          taxExempt: false,
          businessDate: bd,
          terminalId: termId,
          employeeId: userId,
          createdBy: userId,
          updatedBy: userId,
          placedAt: ts,
          paidAt: isVoided ? null : new Date(ts.getTime() + 120_000),
          voidedAt: isVoided ? new Date(ts.getTime() + 300_000) : null,
          voidReason: isVoided ? 'Customer changed their mind' : null,
          voidedBy: isVoided ? userId : null,
        });

        // Tender for paid orders
        if (!isVoided) {
          const isCash = rand() < CASH_RATIO;
          const tipRate = isCash ? 0 : randBetween(0.15, 0.22);
          const tipAmount = isCash ? 0 : Math.round(orderTotal * tipRate);
          const tenderAmount = orderTotal + tipAmount;
          const amountGiven = isCash ? Math.ceil(orderTotal / 100) * 100 : tenderAmount;
          const changeGiven = isCash ? amountGiven - orderTotal : 0;

          allTenderInserts.push({
            id: generateUlid(),
            tenantId,
            locationId: locId,
            orderId,
            tenderType: isCash ? 'cash' : 'card',
            tenderSequence: 1,
            amount: orderTotal,
            tipAmount,
            changeGiven,
            amountGiven,
            currency: 'USD',
            status: 'captured',
            businessDate: bd,
            source: 'pos',
            employeeId: userId,
            terminalId: termId,
            createdBy: userId,
            createdAt: new Date(ts.getTime() + 120_000),
          });

          totalRevenueCents += orderTotal;
        }

        // Revenue activity row (per-order, regardless of void status)
        allActivityInserts.push({
          id: generateUlid(),
          tenantId,
          locationId: locId,
          businessDate: bd,
          source: 'pos_order',
          sourceSubType: 'pos_retail',
          sourceId: orderId,
          sourceLabel: `Order #${orderNum}`,
          referenceNumber: orderNum,
          customerName: custName,
          customerId: custId,
          employeeId: userId,
          employeeName: userName,
          amountDollars: (orderTotal / 100).toFixed(4),
          subtotalDollars: (orderSubtotal / 100).toFixed(4),
          taxDollars: (orderTaxTotal / 100).toFixed(4),
          discountDollars: '0.0000',
          serviceChargeDollars: '0.0000',
          status: isVoided ? 'voided' : 'completed',
          occurredAt: ts,
          createdAt: ts,
        });

        totalOrderCount++;

        // Daily aggregation
        const dailyKey = `${bd}|${locId}`;
        if (!dailyAgg[dailyKey]) {
          dailyAgg[dailyKey] = {
            orderCount: 0, grossSales: 0, taxTotal: 0, netSales: 0,
            discountTotal: 0, tenderCash: 0, tenderCard: 0,
            tenderGiftCard: 0, tenderHouseAccount: 0, tenderAch: 0, tenderOther: 0,
            tipTotal: 0, serviceChargeTotal: 0, surchargeTotal: 0, returnTotal: 0,
            voidCount: 0, voidTotal: 0, locationId: locId,
          };
        }
        const day = dailyAgg[dailyKey]!;
        if (isVoided) {
          day.voidCount++;
          day.voidTotal += orderTotal / 100;
        } else {
          day.orderCount++;
          day.grossSales += orderSubtotal / 100;
          day.taxTotal += orderTaxTotal / 100;
          day.netSales += orderSubtotal / 100;
          const lastTender = allTenderInserts[allTenderInserts.length - 1] as Record<string, unknown>;
          if (lastTender && lastTender.orderId === orderId) {
            if (lastTender.tenderType === 'cash') {
              day.tenderCash += (lastTender.amount as number) / 100;
            } else {
              day.tenderCard += (lastTender.amount as number) / 100;
            }
            // Track tips from card tenders (cash tips are 0)
            day.tipTotal += (lastTender.tipAmount as number) / 100;
          }
        }
      }

      // Progress
      if (dayOffset % 50 === 0 || dayOffset === DAYS_BACK - 1) {
        console.log(`  Day ${dayOffset + 1}/${DAYS_BACK}: ${totalOrderCount} orders, $${(totalRevenueCents / 100).toLocaleString()} revenue`);
      }
    }

    console.log(`\n── Summary ──────────────────────────────────`);
    console.log(`  Total orders: ${allOrderInserts.length}`);
    console.log(`  Total lines: ${allLineInserts.length}`);
    console.log(`  Total taxes: ${allTaxInserts.length}`);
    console.log(`  Total tenders: ${allTenderInserts.length}`);
    console.log(`  Total revenue: $${(totalRevenueCents / 100).toLocaleString()}`);
    console.log(`  Avg order: $${(totalRevenueCents / allTenderInserts.length / 100).toFixed(2)}`);
    console.log(`  Activity rows: ${allActivityInserts.length}`);
    console.log(`  Daily sales rows: ${Object.keys(dailyAgg).length}`);
    console.log(`  Item sales rows: ${Object.keys(itemAgg).length}`);

    // ── 4. Batch insert ────────────────────────────────────────
    console.log('\n── Inserting data (additive only)...');
    const BATCH = 100;

    console.log('  Orders...');
    for (let i = 0; i < allOrderInserts.length; i += BATCH) {
      await db.insert(orders).values(allOrderInserts.slice(i, i + BATCH) as any);
    }

    console.log('  Order lines...');
    for (let i = 0; i < allLineInserts.length; i += BATCH) {
      await db.insert(orderLines).values(allLineInserts.slice(i, i + BATCH) as any);
    }

    console.log('  Order line taxes...');
    for (let i = 0; i < allTaxInserts.length; i += BATCH) {
      await db.insert(orderLineTaxes).values(allTaxInserts.slice(i, i + BATCH) as any);
    }

    console.log('  Tenders...');
    for (let i = 0; i < allTenderInserts.length; i += BATCH) {
      await db.insert(tenders).values(allTenderInserts.slice(i, i + BATCH) as any);
    }

    console.log('  Revenue activity...');
    for (let i = 0; i < allActivityInserts.length; i += BATCH) {
      const batch = allActivityInserts.slice(i, i + BATCH);
      for (const row of batch) {
        await db.execute(sql`
          INSERT INTO rm_revenue_activity (
            id, tenant_id, location_id, business_date,
            source, source_sub_type, source_id, source_label,
            reference_number, customer_name, customer_id,
            employee_id, employee_name,
            amount_dollars, subtotal_dollars, tax_dollars,
            discount_dollars, service_charge_dollars,
            status, occurred_at, created_at
          ) VALUES (
            ${row.id}, ${row.tenantId}, ${row.locationId}, ${row.businessDate},
            ${row.source}, ${row.sourceSubType}, ${row.sourceId}, ${row.sourceLabel},
            ${row.referenceNumber}, ${row.customerName}, ${row.customerId},
            ${row.employeeId}, ${row.employeeName},
            ${row.amountDollars}, ${row.subtotalDollars}, ${row.taxDollars},
            ${row.discountDollars}, ${row.serviceChargeDollars},
            ${row.status}, ${row.occurredAt}, ${row.createdAt}
          )
          ON CONFLICT (tenant_id, source, source_id)
          DO UPDATE SET
            amount_dollars = EXCLUDED.amount_dollars,
            subtotal_dollars = EXCLUDED.subtotal_dollars,
            tax_dollars = EXCLUDED.tax_dollars,
            status = EXCLUDED.status
        `);
      }
    }

    // ── 5. Update order counters ───────────────────────────────
    console.log('  Updating order counters...');
    for (const [locId, lastNum] of Object.entries(orderNumberCounters)) {
      const existing = existingCounters.find(c => c.locationId === locId);
      if (existing) {
        await db.execute(
          sql`UPDATE order_counters SET last_number = ${lastNum} WHERE tenant_id = ${tenantId} AND location_id = ${locId}`
        );
      } else {
        await db.insert(orderCounters).values({ tenantId, locationId: locId, lastNumber: lastNum });
      }
    }

    // ── 6. Populate read models (upsert) ───────────────────────
    console.log('  Daily sales read model (upsert)...');
    const dailySalesRows = Object.entries(dailyAgg).map(([key, agg]) => {
      const [bd2] = key.split('|');
      const avgOrderValue = agg.orderCount > 0 ? agg.netSales / agg.orderCount : 0;
      return {
        tenantId,
        locationId: agg.locationId,
        businessDate: bd2!,
        orderCount: agg.orderCount,
        grossSales: agg.grossSales.toFixed(4),
        discountTotal: agg.discountTotal.toFixed(4),
        taxTotal: agg.taxTotal.toFixed(4),
        netSales: agg.netSales.toFixed(4),
        tenderCash: agg.tenderCash.toFixed(4),
        tenderCard: agg.tenderCard.toFixed(4),
        tenderGiftCard: agg.tenderGiftCard.toFixed(4),
        tenderHouseAccount: agg.tenderHouseAccount.toFixed(4),
        tenderAch: agg.tenderAch.toFixed(4),
        tenderOther: agg.tenderOther.toFixed(4),
        tipTotal: agg.tipTotal.toFixed(4),
        serviceChargeTotal: agg.serviceChargeTotal.toFixed(4),
        surchargeTotal: agg.surchargeTotal.toFixed(4),
        returnTotal: agg.returnTotal.toFixed(4),
        voidCount: agg.voidCount,
        voidTotal: agg.voidTotal.toFixed(4),
        avgOrderValue: avgOrderValue.toFixed(4),
      };
    });

    // Use raw SQL for ON CONFLICT upsert
    for (const row of dailySalesRows) {
      await db.execute(sql`
        INSERT INTO rm_daily_sales (
          tenant_id, location_id, business_date, order_count,
          gross_sales, discount_total, tax_total, net_sales,
          tender_cash, tender_card, tender_gift_card, tender_house_account,
          tender_ach, tender_other, tip_total, service_charge_total,
          surcharge_total, return_total,
          void_count, void_total, avg_order_value
        )
        VALUES (
          ${row.tenantId}, ${row.locationId}, ${row.businessDate}, ${row.orderCount},
          ${row.grossSales}, ${row.discountTotal}, ${row.taxTotal}, ${row.netSales},
          ${row.tenderCash}, ${row.tenderCard}, ${row.tenderGiftCard}, ${row.tenderHouseAccount},
          ${row.tenderAch}, ${row.tenderOther}, ${row.tipTotal}, ${row.serviceChargeTotal},
          ${row.surchargeTotal}, ${row.returnTotal},
          ${row.voidCount}, ${row.voidTotal}, ${row.avgOrderValue}
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
          tender_gift_card = EXCLUDED.tender_gift_card,
          tender_house_account = EXCLUDED.tender_house_account,
          tender_ach = EXCLUDED.tender_ach,
          tender_other = EXCLUDED.tender_other,
          tip_total = EXCLUDED.tip_total,
          service_charge_total = EXCLUDED.service_charge_total,
          surcharge_total = EXCLUDED.surcharge_total,
          return_total = EXCLUDED.return_total,
          void_count = EXCLUDED.void_count,
          void_total = EXCLUDED.void_total,
          avg_order_value = EXCLUDED.avg_order_value
      `);
    }
    console.log(`  rm_daily_sales: ${dailySalesRows.length} rows upserted`);

    console.log('  Item sales read model (upsert)...');
    const itemSalesRows = Object.entries(itemAgg)
      .filter(([, agg]) => agg.quantitySold > 0)
      .map(([key, agg]) => {
        const [bd2] = key.split('|');
        return {
          tenantId,
          locationId: agg.locationId,
          businessDate: bd2!,
          catalogItemId: agg.catalogItemId,
          catalogItemName: agg.catalogItemName,
          categoryName: agg.categoryName,
          quantitySold: agg.quantitySold,
          grossRevenue: agg.grossRevenue.toFixed(4),
        };
      });

    for (const row of itemSalesRows) {
      await db.execute(sql`
        INSERT INTO rm_item_sales (tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, category_name, quantity_sold, gross_revenue)
        VALUES (${row.tenantId}, ${row.locationId}, ${row.businessDate}, ${row.catalogItemId}, ${row.catalogItemName}, ${row.categoryName}, ${row.quantitySold}, ${row.grossRevenue})
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          catalog_item_name = EXCLUDED.catalog_item_name,
          category_name = EXCLUDED.category_name,
          quantity_sold = EXCLUDED.quantity_sold,
          gross_revenue = EXCLUDED.gross_revenue
      `);
    }
    console.log(`  rm_item_sales: ${itemSalesRows.length} rows upserted`);

    // ── 7. Final verification ──────────────────────────────────
    console.log('\n── Verification ─────────────────────────────');
    const finalCountResult = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(orders).where(eq(orders.tenantId, tenantId));
    const finalOrderCount = finalCountResult[0]?.count ?? 0;
    console.log(`  Total orders in DB: ${finalOrderCount}`);

    const [minMax] = await db.select({
      minDate: sql<string>`MIN(business_date)`,
      maxDate: sql<string>`MAX(business_date)`,
    }).from(orders).where(eq(orders.tenantId, tenantId));
    console.log(`  Date range: ${minMax?.minDate} to ${minMax?.maxDate}`);

    const [revenue] = await db.select({
      total: sql<string>`(SUM(total) / 100.0)::numeric(12,2)`,
    }).from(orders).where(sql`tenant_id = ${tenantId} AND status = 'paid'`);
    console.log(`  Total paid revenue: $${Number(revenue?.total ?? 0).toLocaleString()}`);

    const [dailyCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(rmDailySales).where(eq(rmDailySales.tenantId, tenantId));
    console.log(`  rm_daily_sales rows: ${dailyCount?.count}`);

    const [activityCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(rmRevenueActivity).where(eq(rmRevenueActivity.tenantId, tenantId));
    console.log(`  rm_revenue_activity rows: ${activityCount?.count}`);

    console.log('\n✅ Year seed complete! (additive only — no data was deleted)');
  } finally {
    await client.end();
  }
}

seedYear().catch((err) => {
  console.error('Year seed failed:', err);
  process.exit(1);
});
