/**
 * Seed Load Test Data
 *
 * Creates multi-tenant test data for k6 load testing.
 * Uses Drizzle ORM + postgres.js — NOT Prisma.
 *
 * Profiles:
 *   stage1     — 10 tenants, 100 items each, 50 customers, 200 orders
 *   stage2-lite — 50 tenants, 500 items each, 200 customers, 1000 orders
 *   stage2-full — 100 tenants, 1000 items, 500 customers, 5000 orders
 *
 * Usage:
 *   npx tsx load-tests/scripts/seed-load-test.ts --profile stage1
 *   npx tsx load-tests/scripts/seed-load-test.ts --profile stage2-lite --tenant-count 50
 *
 * Outputs:
 *   load-tests/auth-tokens.json — JWT pool for k6 SharedArray
 *   load-tests/seed-manifest.json — Item/customer/order IDs per tenant
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../../packages/db/src/schema/index.js';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────

const PROFILES = {
  stage1: {
    tenantCount: 10,
    itemsPerTenant: 100,
    customersPerTenant: 50,
    ordersPerTenant: 200,
    locationsPerTenant: 2,
    usersPerTenant: 5,
    tenantSizes: { large: 2, medium: 3, small: 5 },
  },
  'stage2-lite': {
    tenantCount: 50,
    itemsPerTenant: 500,
    customersPerTenant: 200,
    ordersPerTenant: 1000,
    locationsPerTenant: 3,
    usersPerTenant: 8,
    tenantSizes: { large: 5, medium: 15, small: 30 },
  },
  'stage2-full': {
    tenantCount: 100,
    itemsPerTenant: 1000,
    customersPerTenant: 500,
    ordersPerTenant: 5000,
    locationsPerTenant: 5,
    usersPerTenant: 12,
    tenantSizes: { large: 10, medium: 30, small: 60 },
  },
} as const;

type ProfileName = keyof typeof PROFILES;

const args = process.argv.slice(2);
const profileArg = args.find((a) => a.startsWith('--profile'))?.split('=')[1]
  || args[args.indexOf('--profile') + 1]
  || 'stage1';
const tenantCountOverride = args.find((a) => a.startsWith('--tenant-count'))?.split('=')[1];

const profile = PROFILES[profileArg as ProfileName];
if (!profile) {
  console.error(`Unknown profile: ${profileArg}. Valid: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

const TENANT_COUNT = tenantCountOverride ? parseInt(tenantCountOverride, 10) : profile.tenantCount;

console.log(`\n🌱 Seeding load test data: profile=${profileArg}, tenants=${TENANT_COUNT}`);
console.log(`   Items/tenant: ${profile.itemsPerTenant}, Customers/tenant: ${profile.customersPerTenant}`);

// ────────────────────────────────────────────────────────
// Database Setup
// ────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(connectionString, { max: 10, prepare: false });
const db = drizzle(client, { schema });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ────────────────────────────────────────────────────────
// ULID Generator
// ────────────────────────────────────────────────────────

function generateUlid(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = crypto.randomBytes(10).toString('hex').slice(0, 16);
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

// ────────────────────────────────────────────────────────
// Tenant Size Assignment
// ────────────────────────────────────────────────────────

function getTenantSize(tenantIndex: number): 'large' | 'medium' | 'small' {
  if (tenantIndex <= profile.tenantSizes.large) return 'large';
  if (tenantIndex <= profile.tenantSizes.large + profile.tenantSizes.medium) return 'medium';
  return 'small';
}

// ────────────────────────────────────────────────────────
// Seed Functions
// ────────────────────────────────────────────────────────

interface TenantAuth {
  tenantId: string;
  tenantIndex: number;
  tenantSize: string;
  locationIds: string[];
  users: Array<{ userId: string; email: string; jwt: string; role: string }>;
}

interface SeedManifest {
  tenantItems: Record<string, Array<{ catalogItemId: string; sku: string; name: string }>>;
  tenantCustomers: Record<string, Array<{ customerId: string }>>;
  tenantOrders: Record<string, Array<{ orderId: string }>>;
}

const authTokens: TenantAuth[] = [];
const manifest: SeedManifest = {
  tenantItems: {},
  tenantCustomers: {},
  tenantOrders: {},
};

async function createTenant(tenantIndex: number): Promise<TenantAuth> {
  const pad = String(tenantIndex).padStart(2, '0');
  const tenantSize = getTenantSize(tenantIndex);
  const tenantId = generateUlid();
  const slug = `loadtest-tenant-${pad}`;

  console.log(`  Creating tenant ${pad} (${tenantSize})...`);

  // Create tenant
  await db.execute(sql`
    INSERT INTO tenants (id, name, slug, status)
    VALUES (${tenantId}, ${'Load Test Tenant ' + pad}, ${slug}, 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `);

  // Re-fetch in case it already existed
  const [existing] = await db.execute(sql`
    SELECT id FROM tenants WHERE slug = ${slug}
  `) as any[];
  const actualTenantId = existing?.id || tenantId;

  // Create locations
  const locationIds: string[] = [];
  for (let loc = 1; loc <= profile.locationsPerTenant; loc++) {
    const locId = generateUlid();
    await db.execute(sql`
      INSERT INTO locations (id, tenant_id, name, slug, status, timezone)
      VALUES (
        ${locId},
        ${actualTenantId},
        ${'Location ' + loc + ' - Tenant ' + pad},
        ${'loc-' + pad + '-' + loc},
        'active',
        'America/New_York'
      )
      ON CONFLICT DO NOTHING
    `);
    locationIds.push(locId);
  }

  // Create users with Supabase auth (or mock JWTs)
  const roles = ['owner', 'manager', 'cashier', 'cashier', 'cashier'];
  const users: TenantAuth['users'] = [];

  for (let u = 0; u < Math.min(profile.usersPerTenant, roles.length); u++) {
    const role = roles[u] || 'cashier';
    const email = `user_${u + 1}@tenant_${pad}.test`;
    const userId = generateUlid();

    // Insert user directly (for load testing, we bypass Supabase auth)
    await db.execute(sql`
      INSERT INTO users (id, tenant_id, email, display_name, status)
      VALUES (${userId}, ${actualTenantId}, ${email}, ${'User ' + (u + 1)}, 'active')
      ON CONFLICT DO NOTHING
    `);

    // Create role assignment
    await db.execute(sql`
      INSERT INTO user_roles (id, tenant_id, user_id, role)
      VALUES (${generateUlid()}, ${actualTenantId}, ${userId}, ${role})
      ON CONFLICT DO NOTHING
    `);

    // Generate a mock JWT for load testing
    // In production, you'd use Supabase service role to create real tokens
    let jwt = '';
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: `LoadTest!${pad}_${u + 1}`,
          email_confirm: true,
          user_metadata: { display_name: `User ${u + 1}` },
        });
        if (data?.user) {
          const { data: session } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email,
          });
          // Use a service-generated token
          jwt = session?.properties?.hashed_token || '';
        }
      } catch {
        // Supabase not available — use placeholder
      }
    }

    if (!jwt) {
      // Fallback: base64 encode a mock payload for testing
      // Real deployments should use Supabase-generated tokens
      const payload = {
        sub: userId,
        email,
        role: 'authenticated',
        aud: 'authenticated',
        tenant_id: actualTenantId,
        exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
      };
      jwt = `mock.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test`;
    }

    users.push({ userId, email, jwt, role });
  }

  return {
    tenantId: actualTenantId,
    tenantIndex,
    tenantSize,
    locationIds,
    users,
  };
}

async function seedItems(tenantAuth: TenantAuth): Promise<void> {
  const pad = String(tenantAuth.tenantIndex).padStart(2, '0');
  const key = `T${pad}`;
  manifest.tenantItems[key] = [];

  const { tenantId, locationIds } = tenantAuth;
  const locationId = locationIds[0];

  // Create a default category
  const categoryId = generateUlid();
  await db.execute(sql`
    INSERT INTO categories (id, tenant_id, name, slug, depth, display_order)
    VALUES (${categoryId}, ${tenantId}, ${'General - T' + pad}, ${'general-t' + pad}, 0, 0)
    ON CONFLICT DO NOTHING
  `);

  // Create items in batches
  const batchSize = 50;
  for (let batch = 0; batch < Math.ceil(profile.itemsPerTenant / batchSize); batch++) {
    const items: Array<{ id: string; sku: string; name: string }> = [];

    for (let i = 0; i < batchSize; i++) {
      const itemNum = batch * batchSize + i + 1;
      if (itemNum > profile.itemsPerTenant) break;

      const id = generateUlid();
      const sku = `T${pad}_SKU_${String(itemNum).padStart(5, '0')}`;
      const name = `Item ${itemNum} - Tenant ${pad}`;
      const price = ((Math.random() * 50 + 1) * 100) / 100;

      items.push({ id, sku, name });

      await db.execute(sql`
        INSERT INTO catalog_items (id, tenant_id, name, sku, item_type, default_price, status, category_id)
        VALUES (${id}, ${tenantId}, ${name}, ${sku}, 'retail', ${price.toFixed(2)}, 'active', ${categoryId})
        ON CONFLICT DO NOTHING
      `);

      // Create inventory item
      await db.execute(sql`
        INSERT INTO inventory_items (id, tenant_id, catalog_item_id, location_id, reorder_point, reorder_qty, allow_negative, track_inventory)
        VALUES (${generateUlid()}, ${tenantId}, ${id}, ${locationId}, 10, 50, false, true)
        ON CONFLICT DO NOTHING
      `);

      // Seed initial stock (1000 units per item for load test headroom)
      await db.execute(sql`
        INSERT INTO inventory_movements (id, tenant_id, inventory_item_id, movement_type, quantity_delta, reference_type, reference_id, notes)
        VALUES (
          ${generateUlid()}, ${tenantId},
          (SELECT id FROM inventory_items WHERE catalog_item_id = ${id} AND location_id = ${locationId} LIMIT 1),
          'receive', 1000, 'seed', ${'seed_' + sku}, 'Load test seed stock'
        )
        ON CONFLICT DO NOTHING
      `);
    }

    manifest.tenantItems[key].push(
      ...items.map((it) => ({
        catalogItemId: it.id,
        sku: it.sku,
        name: it.name,
      })),
    );
  }
}

async function seedCustomers(tenantAuth: TenantAuth): Promise<void> {
  const pad = String(tenantAuth.tenantIndex).padStart(2, '0');
  const key = `T${pad}`;
  manifest.tenantCustomers[key] = [];

  const { tenantId } = tenantAuth;

  for (let i = 1; i <= profile.customersPerTenant; i++) {
    const id = generateUlid();
    const email = `customer_${i}@tenant_${pad}.test`;
    const firstName = `Customer`;
    const lastName = `${pad}_${String(i).padStart(4, '0')}`;
    const displayName = `${firstName} ${lastName}`;

    await db.execute(sql`
      INSERT INTO customers (id, tenant_id, type, email, first_name, last_name, display_name, status)
      VALUES (${id}, ${tenantId}, 'person', ${email}, ${firstName}, ${lastName}, ${displayName}, 'active')
      ON CONFLICT DO NOTHING
    `);

    manifest.tenantCustomers[key].push({ customerId: id });
  }
}

async function seedOrders(tenantAuth: TenantAuth): Promise<void> {
  const pad = String(tenantAuth.tenantIndex).padStart(2, '0');
  const key = `T${pad}`;
  manifest.tenantOrders[key] = [];

  const { tenantId, locationIds } = tenantAuth;
  const locationId = locationIds[0];
  const items = manifest.tenantItems[key] || [];

  if (items.length === 0) return;

  // Create orders in batches
  const batchSize = 50;
  for (let batch = 0; batch < Math.ceil(profile.ordersPerTenant / batchSize); batch++) {
    for (let i = 0; i < batchSize; i++) {
      const orderNum = batch * batchSize + i + 1;
      if (orderNum > profile.ordersPerTenant) break;

      const orderId = generateUlid();
      const orderNumber = `T${pad}-${String(orderNum).padStart(6, '0')}`;
      const today = new Date();
      const businessDate = new Date(today.getTime() - Math.random() * 30 * 86400000)
        .toISOString()
        .slice(0, 10);

      // Pick 1-3 random items
      const lineCount = Math.floor(Math.random() * 3) + 1;
      let subtotal = 0;

      await db.execute(sql`
        INSERT INTO orders (id, tenant_id, location_id, order_number, status, source, business_date, version)
        VALUES (${orderId}, ${tenantId}, ${locationId}, ${orderNumber}, 'placed', 'pos', ${businessDate}, 1)
        ON CONFLICT DO NOTHING
      `);

      for (let l = 0; l < lineCount; l++) {
        const item = items[Math.floor(Math.random() * items.length)];
        const unitPrice = Math.floor(Math.random() * 5000 + 100); // 1.00 - 51.00
        subtotal += unitPrice;

        await db.execute(sql`
          INSERT INTO order_lines (id, tenant_id, order_id, catalog_item_id, sku, name, qty, unit_price, extended_price, line_number)
          VALUES (
            ${generateUlid()}, ${tenantId}, ${orderId},
            ${item.catalogItemId}, ${item.sku}, ${item.name},
            '1', ${unitPrice}, ${unitPrice}, ${l + 1}
          )
          ON CONFLICT DO NOTHING
        `);
      }

      // Update order totals
      await db.execute(sql`
        UPDATE orders SET subtotal = ${subtotal}, total = ${subtotal}, placed_at = NOW()
        WHERE id = ${orderId}
      `);

      manifest.tenantOrders[key].push({ orderId });
    }
  }
}

// ────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  try {
    // Enable module entitlements for all tenants
    console.log('\n📋 Creating tenants and users...');

    for (let i = 1; i <= TENANT_COUNT; i++) {
      const tenantAuth = await createTenant(i);
      authTokens.push(tenantAuth);
    }

    console.log('\n📦 Seeding catalog items...');
    for (const tenantAuth of authTokens) {
      await seedItems(tenantAuth);
      process.stdout.write('.');
    }
    console.log(' Done');

    console.log('\n👥 Seeding customers...');
    for (const tenantAuth of authTokens) {
      await seedCustomers(tenantAuth);
      process.stdout.write('.');
    }
    console.log(' Done');

    console.log('\n🧾 Seeding orders...');
    for (const tenantAuth of authTokens) {
      await seedOrders(tenantAuth);
      process.stdout.write('.');
    }
    console.log(' Done');

    // Write auth tokens file
    const authPath = path.join(__dirname, '..', 'auth-tokens.json');
    fs.writeFileSync(authPath, JSON.stringify({ tenants: authTokens }, null, 2));
    console.log(`\n✅ Auth tokens written to: ${authPath}`);

    // Write seed manifest
    const manifestPath = path.join(__dirname, '..', 'seed-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✅ Seed manifest written to: ${manifestPath}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalItems = Object.values(manifest.tenantItems).reduce((s, a) => s + a.length, 0);
    const totalCustomers = Object.values(manifest.tenantCustomers).reduce((s, a) => s + a.length, 0);
    const totalOrders = Object.values(manifest.tenantOrders).reduce((s, a) => s + a.length, 0);

    console.log(`\n🎉 Seed complete in ${elapsed}s`);
    console.log(`   ${TENANT_COUNT} tenants, ${totalItems} items, ${totalCustomers} customers, ${totalOrders} orders`);
  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
