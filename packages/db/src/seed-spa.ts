/**
 * seed-spa.ts — Spa module seed data
 *
 * Generates ~1 year of realistic spa data:
 *   - 5 service categories, 15 services, 15+ add-ons
 *   - 6 providers with availability and eligibility
 *   - 8 resources (rooms, stations, etc.)
 *   - 10 new customers (+ existing seed customers)
 *   - ~1,800 appointments with full lifecycle
 *   - Commission rules and ledger entries
 *   - Package definitions and customer purchases
 *   - 4 CQRS read model tables populated
 *
 * Usage:
 *   pnpm tsx packages/db/src/seed-spa.ts          # local
 *   pnpm tsx packages/db/src/seed-spa.ts --remote  # production
 *
 * Prerequisites: pnpm db:seed must have run first.
 */

import dotenv from 'dotenv';
import * as readline from 'node:readline';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '../../.env.remote', override: true });
}
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';

// ══════════════════════════════════════════════════════════════
// ══ PRNG (deterministic) ═════════════════════════════════════
// ══════════════════════════════════════════════════════════════

function mulberry32(seed: number) {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260301);

function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randBetween(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function bizDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toTimestamptz(d: Date): string {
  return d.toISOString();
}

function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// ══════════════════════════════════════════════════════════════
// ══ DATA CATALOG ═════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

interface ServiceDef {
  name: string;
  displayName: string;
  category: string;
  durationMinutes: number;
  price: string; // dollars NUMERIC(12,2)
  memberPrice: string;
  peakPrice: string;
  bufferMinutes: number;
  description: string;
  resourceType: string;
}

const SERVICE_CATEGORIES = [
  { name: 'Massage Therapy', icon: '💆', description: 'Therapeutic and relaxation massage services', sortOrder: 1 },
  { name: 'Facials', icon: '🧖', description: 'Skin care and facial treatments', sortOrder: 2 },
  { name: 'Body Treatments', icon: '🛁', description: 'Full body wraps, scrubs, and treatments', sortOrder: 3 },
  { name: 'Nail Services', icon: '💅', description: 'Manicure, pedicure, and nail care', sortOrder: 4 },
  { name: 'Wellness', icon: '🧘', description: 'Holistic wellness and relaxation', sortOrder: 5 },
];

const SERVICES: ServiceDef[] = [
  // Massage Therapy
  { name: 'swedish-massage', displayName: 'Swedish Massage', category: 'Massage Therapy', durationMinutes: 60, price: '120.00', memberPrice: '102.00', peakPrice: '144.00', bufferMinutes: 15, description: 'Classic relaxation massage with long flowing strokes', resourceType: 'treatment_room' },
  { name: 'deep-tissue', displayName: 'Deep Tissue Massage', category: 'Massage Therapy', durationMinutes: 60, price: '150.00', memberPrice: '127.50', peakPrice: '180.00', bufferMinutes: 15, description: 'Firm pressure targeting deep muscle layers', resourceType: 'treatment_room' },
  { name: 'hot-stone', displayName: 'Hot Stone Massage', category: 'Massage Therapy', durationMinutes: 90, price: '180.00', memberPrice: '153.00', peakPrice: '216.00', bufferMinutes: 15, description: 'Heated basalt stones combined with massage therapy', resourceType: 'treatment_room' },
  { name: 'prenatal-massage', displayName: 'Prenatal Massage', category: 'Massage Therapy', durationMinutes: 60, price: '130.00', memberPrice: '110.50', peakPrice: '156.00', bufferMinutes: 15, description: 'Gentle massage designed for expectant mothers', resourceType: 'treatment_room' },
  // Facials
  { name: 'classic-facial', displayName: 'Classic Facial', category: 'Facials', durationMinutes: 45, price: '95.00', memberPrice: '80.75', peakPrice: '114.00', bufferMinutes: 15, description: 'Deep cleansing facial with extraction and mask', resourceType: 'treatment_room' },
  { name: 'anti-aging-facial', displayName: 'Anti-Aging Facial', category: 'Facials', durationMinutes: 75, price: '160.00', memberPrice: '136.00', peakPrice: '192.00', bufferMinutes: 15, description: 'Advanced treatment targeting fine lines and wrinkles', resourceType: 'treatment_room' },
  { name: 'hydrating-facial', displayName: 'Hydrating Facial', category: 'Facials', durationMinutes: 60, price: '120.00', memberPrice: '102.00', peakPrice: '144.00', bufferMinutes: 15, description: 'Deep moisture replenishment for dry skin', resourceType: 'treatment_room' },
  // Body Treatments
  { name: 'body-wrap', displayName: 'Detox Body Wrap', category: 'Body Treatments', durationMinutes: 75, price: '140.00', memberPrice: '119.00', peakPrice: '168.00', bufferMinutes: 15, description: 'Full body wrap with detoxifying herbal blend', resourceType: 'wet_room' },
  { name: 'salt-scrub', displayName: 'Sea Salt Scrub', category: 'Body Treatments', durationMinutes: 45, price: '110.00', memberPrice: '93.50', peakPrice: '132.00', bufferMinutes: 15, description: 'Exfoliating salt scrub with essential oils', resourceType: 'wet_room' },
  { name: 'mud-therapy', displayName: 'Mineral Mud Therapy', category: 'Body Treatments', durationMinutes: 90, price: '155.00', memberPrice: '131.75', peakPrice: '186.00', bufferMinutes: 15, description: 'Therapeutic mineral-rich mud application', resourceType: 'wet_room' },
  // Nail Services
  { name: 'manicure', displayName: 'Classic Manicure', category: 'Nail Services', durationMinutes: 30, price: '45.00', memberPrice: '38.25', peakPrice: '54.00', bufferMinutes: 10, description: 'Shape, buff, cuticle care and polish', resourceType: 'nail_station' },
  { name: 'pedicure', displayName: 'Spa Pedicure', category: 'Nail Services', durationMinutes: 45, price: '65.00', memberPrice: '55.25', peakPrice: '78.00', bufferMinutes: 10, description: 'Foot soak, exfoliation, massage and polish', resourceType: 'nail_station' },
  { name: 'gel-manicure', displayName: 'Gel Manicure', category: 'Nail Services', durationMinutes: 45, price: '60.00', memberPrice: '51.00', peakPrice: '72.00', bufferMinutes: 10, description: 'Long-lasting gel polish manicure', resourceType: 'nail_station' },
  // Wellness
  { name: 'aromatherapy', displayName: 'Aromatherapy Session', category: 'Wellness', durationMinutes: 60, price: '100.00', memberPrice: '85.00', peakPrice: '120.00', bufferMinutes: 15, description: 'Essential oil-infused relaxation therapy', resourceType: 'treatment_room' },
  { name: 'meditation', displayName: 'Guided Meditation', category: 'Wellness', durationMinutes: 30, price: '50.00', memberPrice: '42.50', peakPrice: '60.00', bufferMinutes: 10, description: 'Guided meditation with breathing exercises', resourceType: 'meditation_room' },
];

interface AddonDef {
  name: string;
  description: string;
  durationMinutes: number;
  price: string;
  memberPrice: string;
  categories: string[]; // which service categories this applies to
}

const ADDONS: AddonDef[] = [
  { name: 'Hot Towel Treatment', description: 'Warm eucalyptus towel application', durationMinutes: 5, price: '15.00', memberPrice: '12.75', categories: ['Massage Therapy', 'Body Treatments'] },
  { name: 'Aromatherapy Upgrade', description: 'Add essential oils to any service', durationMinutes: 0, price: '25.00', memberPrice: '21.25', categories: ['Massage Therapy', 'Facials', 'Body Treatments'] },
  { name: 'Extended Time (+15 min)', description: 'Add 15 minutes to your service', durationMinutes: 15, price: '30.00', memberPrice: '25.50', categories: ['Massage Therapy', 'Facials'] },
  { name: 'Paraffin Treatment', description: 'Warm paraffin hand or foot treatment', durationMinutes: 10, price: '20.00', memberPrice: '17.00', categories: ['Nail Services', 'Facials'] },
  { name: 'Scalp Massage', description: 'Revitalizing scalp massage with oil', durationMinutes: 10, price: '20.00', memberPrice: '17.00', categories: ['Massage Therapy', 'Wellness'] },
  { name: 'Collagen Boost Mask', description: 'Anti-aging collagen mask application', durationMinutes: 10, price: '35.00', memberPrice: '29.75', categories: ['Facials'] },
  { name: 'CBD Oil Enhancement', description: 'Premium CBD oil added to massage', durationMinutes: 0, price: '25.00', memberPrice: '21.25', categories: ['Massage Therapy'] },
  { name: 'Eye Mask Treatment', description: 'De-puffing cooling eye mask', durationMinutes: 5, price: '15.00', memberPrice: '12.75', categories: ['Facials', 'Wellness'] },
  { name: 'Foot Reflexology Add-On', description: 'Targeted pressure point foot therapy', durationMinutes: 15, price: '25.00', memberPrice: '21.25', categories: ['Massage Therapy', 'Wellness'] },
  { name: 'Nail Art', description: 'Custom nail art and designs', durationMinutes: 15, price: '20.00', memberPrice: '17.00', categories: ['Nail Services'] },
  { name: 'Deep Conditioning Hair Mask', description: 'Intensive hair conditioning treatment', durationMinutes: 15, price: '30.00', memberPrice: '25.50', categories: ['Body Treatments'] },
  { name: 'Lip Treatment', description: 'Exfoliation and hydration for lips', durationMinutes: 5, price: '10.00', memberPrice: '8.50', categories: ['Facials'] },
];

interface ProviderDef {
  displayName: string;
  bio: string;
  specialties: string[];
  eligibleCategories: string[];
  commissionRate: number;
  availabilityPattern: 'weekday_am' | 'weekday_pm' | 'full_week';
}

const PROVIDERS: ProviderDef[] = [
  { displayName: 'Elena Vasquez', bio: 'Licensed massage therapist with 12 years of experience specializing in deep tissue and hot stone techniques.', specialties: ['Deep Tissue', 'Hot Stone', 'Sports Massage'], eligibleCategories: ['Massage Therapy', 'Body Treatments'], commissionRate: 0.35, availabilityPattern: 'weekday_am' },
  { displayName: 'Marcus Chen', bio: 'Certified wellness practitioner with expertise in Eastern and Western massage modalities.', specialties: ['Swedish Massage', 'Aromatherapy', 'Reflexology'], eligibleCategories: ['Massage Therapy', 'Wellness'], commissionRate: 0.30, availabilityPattern: 'full_week' },
  { displayName: 'Sophia Laurent', bio: 'Esthetician and body treatment specialist with advanced certifications in anti-aging skincare.', specialties: ['Anti-Aging', 'Chemical Peels', 'Body Wraps'], eligibleCategories: ['Facials', 'Body Treatments'], commissionRate: 0.32, availabilityPattern: 'weekday_pm' },
  { displayName: 'Aisha Patel', bio: 'Nail technician and esthetician providing meticulous nail art and facial treatments.', specialties: ['Gel Nails', 'Nail Art', 'Facials'], eligibleCategories: ['Nail Services', 'Facials'], commissionRate: 0.28, availabilityPattern: 'full_week' },
  { displayName: 'James O\'Brien', bio: 'Sports massage specialist and wellness coach with a focus on injury recovery.', specialties: ['Sports Massage', 'Meditation', 'Stretching'], eligibleCategories: ['Massage Therapy', 'Wellness'], commissionRate: 0.30, availabilityPattern: 'weekday_am' },
  { displayName: 'Lily Zhang', bio: 'Skincare expert and nail artist with a passion for holistic beauty treatments.', specialties: ['Hydrafacial', 'Gel Polish', 'Skin Analysis'], eligibleCategories: ['Facials', 'Nail Services'], commissionRate: 0.28, availabilityPattern: 'weekday_pm' },
];

interface ResourceDef {
  name: string;
  resourceType: string;
  capacity: number;
}

const RESOURCES: ResourceDef[] = [
  { name: 'Treatment Room 1', resourceType: 'treatment_room', capacity: 1 },
  { name: 'Treatment Room 2', resourceType: 'treatment_room', capacity: 1 },
  { name: 'Treatment Room 3', resourceType: 'treatment_room', capacity: 1 },
  { name: 'Treatment Room 4', resourceType: 'treatment_room', capacity: 1 },
  { name: 'Nail Station 1', resourceType: 'nail_station', capacity: 1 },
  { name: 'Nail Station 2', resourceType: 'nail_station', capacity: 1 },
  { name: 'Wet Room', resourceType: 'wet_room', capacity: 1 },
  { name: 'Meditation Room', resourceType: 'meditation_room', capacity: 6 },
];

interface PackageDef {
  name: string;
  description: string;
  packageType: string;
  totalSessions: number;
  sellingPriceCents: number;
  validityDays: number;
  includedCategories: string[];
}

const PACKAGES: PackageDef[] = [
  { name: 'Relaxation Package', description: '5 massage or body treatment sessions at a discounted rate', packageType: 'session_bundle', totalSessions: 5, sellingPriceCents: 50000, validityDays: 180, includedCategories: ['Massage Therapy', 'Body Treatments'] },
  { name: 'Monthly Wellness', description: '4 sessions per month for ongoing wellness', packageType: 'session_bundle', totalSessions: 4, sellingPriceCents: 35000, validityDays: 30, includedCategories: ['Massage Therapy', 'Wellness'] },
  { name: 'Couples Retreat', description: '2 massages and 2 facials — the perfect couples experience', packageType: 'session_bundle', totalSessions: 4, sellingPriceCents: 60000, validityDays: 90, includedCategories: ['Massage Therapy', 'Facials'] },
];

interface NewCustomerDef {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const NEW_CUSTOMERS: NewCustomerDef[] = [
  { firstName: 'Olivia', lastName: 'Martinez', email: 'olivia.martinez@email.test', phone: '910-555-0201' },
  { firstName: 'Ethan', lastName: 'Brooks', email: 'ethan.brooks@email.test', phone: '910-555-0202' },
  { firstName: 'Isabella', lastName: 'Cooper', email: 'isabella.cooper@email.test', phone: '910-555-0203' },
  { firstName: 'Mason', lastName: 'Reed', email: 'mason.reed@email.test', phone: '910-555-0204' },
  { firstName: 'Ava', lastName: 'Kim', email: 'ava.kim@email.test', phone: '910-555-0205' },
  { firstName: 'Liam', lastName: 'Torres', email: 'liam.torres@email.test', phone: '910-555-0206' },
  { firstName: 'Charlotte', lastName: 'Foster', email: 'charlotte.foster@email.test', phone: '910-555-0207' },
  { firstName: 'Noah', lastName: 'Nguyen', email: 'noah.nguyen@email.test', phone: '910-555-0208' },
  { firstName: 'Amelia', lastName: 'Rivera', email: 'amelia.rivera@email.test', phone: '910-555-0209' },
  { firstName: 'Lucas', lastName: 'Campbell', email: 'lucas.campbell@email.test', phone: '910-555-0210' },
];

// ══════════════════════════════════════════════════════════════
// ══ SEASONAL / SCHEDULING LOGIC ══════════════════════════════
// ══════════════════════════════════════════════════════════════

function getSeasonMultiplier(month: number): number {
  // month is 0-indexed: Jan=0
  if (month >= 11 || month <= 1) return 1.3; // Dec-Feb: cold weather spa demand
  if (month >= 2 && month <= 4) return 1.0; // Mar-May: spring
  if (month >= 5 && month <= 7) return 0.8; // Jun-Aug: summer (people outdoors)
  return 1.1; // Sep-Nov: fall
}

function getDayMultiplier(dayOfWeek: number): number {
  // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return 1.5; // weekends
  if (dayOfWeek === 1) return 0.7; // Monday slow
  if (dayOfWeek === 5) return 1.2; // Friday busy
  return 1.0; // Tue-Thu
}

function isSpecialPeriod(d: Date): number {
  const month = d.getMonth();
  const day = d.getDate();
  // Valentine's week (Feb 10-16)
  if (month === 1 && day >= 10 && day <= 16) return 2.0;
  // Mother's Day week (first full week of May — simplify to May 5-11)
  if (month === 4 && day >= 5 && day <= 11) return 1.8;
  // Holiday season (Dec 15-31)
  if (month === 11 && day >= 15) return 1.5;
  return 1.0;
}

function isPeakTime(hour: number, dayOfWeek: number): boolean {
  // Peak: weekends, or weekday evenings (16-19)
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  return hour >= 16 && hour <= 19;
}

// ══════════════════════════════════════════════════════════════
// ══ MAIN ═════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

async function seedSpa() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Spa Seed: ~1 year of realistic spa data`);
  console.log(`  Target: ${target} (${masked})`);
  console.log(`  Mode: ADDITIVE ONLY`);
  console.log(`${'='.repeat(50)}\n`);

  if (isRemote) {
    console.warn('  WARNING — PRODUCTION DATABASE');
    console.warn('  This will INSERT spa data into production.');
    console.warn('  Running twice creates DUPLICATE data.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('  Type "seed-spa-production" to continue: ', resolve);
    });
    rl.close();

    if (answer.trim() !== 'seed-spa-production') {
      console.error('\n  Aborted. No changes made.\n');
      process.exit(1);
    }
    console.log('\n  Confirmed. Proceeding...\n');
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    // ── 1. Query existing data ───────────────────────────────────
    console.log('-- Querying existing data...');

    const [tenant] = await db.execute(sql`SELECT id, name FROM tenants LIMIT 1`) as Array<{ id: string; name: string }>;
    if (!tenant) throw new Error('No tenant found. Run pnpm db:seed first.');
    const tenantId = tenant.id;
    console.log(`  Tenant: ${tenant.name} (${tenantId})`);

    const allLocs = await db.execute(sql`
      SELECT id, name, location_type FROM locations WHERE tenant_id = ${tenantId} ORDER BY name
    `) as Array<{ id: string; name: string; location_type: string | null }>;
    const venues = allLocs.filter(l => l.location_type === 'venue');
    const locationId = (venues.length > 0 ? venues[0]! : allLocs[0]!).id;
    console.log(`  Location: ${locationId}`);

    const userRows = await db.execute(sql`
      SELECT u.id, u.email, u.name FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId}
      LIMIT 10
    `) as Array<{ id: string; email: string; name: string | null }>;
    if (userRows.length === 0) throw new Error('No users found. Run pnpm db:seed first.');
    console.log(`  Users: ${userRows.length} found`);
    const primaryUserId = userRows[0]!.id;

    const existingCustRows = await db.execute(sql`
      SELECT id, display_name FROM customers WHERE tenant_id = ${tenantId} LIMIT 10
    `) as Array<{ id: string; display_name: string | null }>;
    console.log(`  Existing customers: ${existingCustRows.length}`);

    // ── 2. Spa Settings ──────────────────────────────────────────
    console.log('\n-- Inserting spa settings...');
    const settingsId = generateUlid();
    await db.execute(sql`
      INSERT INTO spa_settings (id, tenant_id, location_id, timezone, day_close_time, default_buffer_minutes, allow_online_booking, max_advance_booking_days, min_advance_booking_hours, cancellation_window_hours)
      VALUES (${settingsId}, ${tenantId}, ${locationId}, 'America/New_York', '00:00', 15, true, 90, 4, 24)
      ON CONFLICT DO NOTHING
    `);

    // ── 3. Service Categories ────────────────────────────────────
    console.log('-- Inserting service categories...');
    const categoryIds: Record<string, string> = {};
    for (const cat of SERVICE_CATEGORIES) {
      const id = generateUlid();
      categoryIds[cat.name] = id;
      await db.execute(sql`
        INSERT INTO spa_service_categories (id, tenant_id, name, description, icon, sort_order, is_active)
        VALUES (${id}, ${tenantId}, ${cat.name}, ${cat.description}, ${cat.icon}, ${cat.sortOrder}, true)
      `);
    }
    console.log(`  ${SERVICE_CATEGORIES.length} categories created`);

    // ── 4. Services ──────────────────────────────────────────────
    console.log('-- Inserting services...');
    const serviceIds: Record<string, { id: string; def: ServiceDef }> = {};
    const servicesByCat: Record<string, string[]> = {};
    for (const svc of SERVICES) {
      const id = generateUlid();
      const catId = categoryIds[svc.category]!;
      serviceIds[svc.name] = { id, def: svc };
      if (!servicesByCat[svc.category]) servicesByCat[svc.category] = [];
      servicesByCat[svc.category]!.push(id);

      await db.execute(sql`
        INSERT INTO spa_services (id, tenant_id, category_id, name, display_name, description, category, duration_minutes, buffer_minutes, price, member_price, peak_price, max_capacity, is_active, allow_online_booking)
        VALUES (${id}, ${tenantId}, ${catId}, ${svc.name}, ${svc.displayName}, ${svc.description}, ${svc.category}, ${svc.durationMinutes}, ${svc.bufferMinutes}, ${svc.price}, ${svc.memberPrice}, ${svc.peakPrice}, 1, true, true)
      `);
    }
    console.log(`  ${SERVICES.length} services created`);

    // ── 5. Add-Ons ───────────────────────────────────────────────
    console.log('-- Inserting service add-ons...');
    const addonIds: string[] = [];
    const addonLinks: Array<{ addonId: string; serviceId: string }> = [];

    for (const addon of ADDONS) {
      const addonId = generateUlid();
      addonIds.push(addonId);
      await db.execute(sql`
        INSERT INTO spa_service_addons (id, tenant_id, name, description, duration_minutes, price, member_price, is_active)
        VALUES (${addonId}, ${tenantId}, ${addon.name}, ${addon.description}, ${addon.durationMinutes}, ${addon.price}, ${addon.memberPrice}, true)
      `);

      // Link addon to applicable services
      for (const cat of addon.categories) {
        const svcIds = servicesByCat[cat] ?? [];
        for (const svcId of svcIds) {
          addonLinks.push({ addonId, serviceId: svcId });
        }
      }
    }
    console.log(`  ${ADDONS.length} add-ons created`);

    // ── 6. Add-On Links ──────────────────────────────────────────
    console.log('-- Linking add-ons to services...');
    for (const link of addonLinks) {
      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO spa_service_addon_links (id, tenant_id, service_id, addon_id, is_default)
        VALUES (${id}, ${tenantId}, ${link.serviceId}, ${link.addonId}, false)
      `);
    }
    console.log(`  ${addonLinks.length} add-on links created`);

    // ── 7. Resources ─────────────────────────────────────────────
    console.log('-- Inserting resources...');
    const resourceIds: Record<string, string[]> = {};
    for (const res of RESOURCES) {
      const id = generateUlid();
      if (!resourceIds[res.resourceType]) resourceIds[res.resourceType] = [];
      resourceIds[res.resourceType]!.push(id);
      await db.execute(sql`
        INSERT INTO spa_resources (id, tenant_id, name, resource_type, capacity, location_id, is_active)
        VALUES (${id}, ${tenantId}, ${res.name}, ${res.resourceType}, ${res.capacity}, ${locationId}, true)
      `);
    }
    console.log(`  ${RESOURCES.length} resources created`);

    // ── 8. Service→Resource Requirements ─────────────────────────
    console.log('-- Linking services to resource requirements...');
    let reqCount = 0;
    for (const svc of SERVICES) {
      const svcId = serviceIds[svc.name]!.id;
      const resType = svc.resourceType;
      const resPool = resourceIds[resType];
      if (resPool && resPool.length > 0) {
        const id = generateUlid();
        await db.execute(sql`
          INSERT INTO spa_service_resource_requirements (id, tenant_id, service_id, resource_type, quantity, is_mandatory)
          VALUES (${id}, ${tenantId}, ${svcId}, ${resType}, 1, true)
        `);
        reqCount++;
      }
    }
    console.log(`  ${reqCount} resource requirements created`);

    // ── 9. New Customers ─────────────────────────────────────────
    console.log('-- Creating new spa customers...');
    const newCustIds: string[] = [];
    for (const cust of NEW_CUSTOMERS) {
      const id = generateUlid();
      newCustIds.push(id);
      await db.execute(sql`
        INSERT INTO customers (id, tenant_id, type, first_name, last_name, display_name, email, phone, status, created_by)
        VALUES (${id}, ${tenantId}, 'person', ${cust.firstName}, ${cust.lastName}, ${cust.firstName + ' ' + cust.lastName}, ${cust.email}, ${cust.phone}, 'active', ${primaryUserId})
      `);
    }
    console.log(`  ${NEW_CUSTOMERS.length} new customers created`);

    // Build full customer pool: new + existing + walk-in (null) slots
    const customerPool: Array<{ id: string; name: string } | null> = [
      ...newCustIds.map((id, i) => ({ id, name: `${NEW_CUSTOMERS[i]!.firstName} ${NEW_CUSTOMERS[i]!.lastName}` })),
      ...existingCustRows.map(c => ({ id: c.id, name: c.display_name ?? 'Customer' })),
      null, null, null, // walk-in probability
    ];

    // ── 10. Providers ────────────────────────────────────────────
    console.log('-- Creating spa providers...');
    const providerIds: Array<{ id: string; def: ProviderDef }> = [];
    const providerServiceMap: Record<string, string[]> = {}; // providerId → serviceId[]

    for (let i = 0; i < PROVIDERS.length; i++) {
      const pDef = PROVIDERS[i]!;
      const id = generateUlid();
      // Cycle through existing users for userId FK
      const userId = userRows[i % userRows.length]!.id;
      providerIds.push({ id, def: pDef });

      await db.execute(sql`
        INSERT INTO spa_providers (id, tenant_id, user_id, display_name, bio, specialties, employment_type, commission_rate, is_active)
        VALUES (${id}, ${tenantId}, ${userId}, ${pDef.displayName}, ${pDef.bio}, ${JSON.stringify(pDef.specialties)}, 'employee', ${pDef.commissionRate.toFixed(2)}, true)
      `);

      // Determine eligible services
      const eligibleSvcIds: string[] = [];
      for (const cat of pDef.eligibleCategories) {
        const sids = servicesByCat[cat] ?? [];
        eligibleSvcIds.push(...sids);
      }
      providerServiceMap[id] = eligibleSvcIds;
    }
    console.log(`  ${PROVIDERS.length} providers created`);

    // ── 11. Provider Availability ────────────────────────────────
    console.log('-- Setting provider availability...');
    let availCount = 0;
    for (const prov of providerIds) {
      const pattern = prov.def.availabilityPattern;
      // Mon=1 through Fri=5, some get Sat=6
      const days = pattern === 'full_week' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      const startTime = pattern === 'weekday_pm' ? '10:00' : '08:00';
      const endTime = pattern === 'weekday_pm' ? '19:00' : '17:00';

      for (const dow of days) {
        const st = dow === 6 ? '09:00' : startTime;
        const et = dow === 6 ? '14:00' : endTime;
        const id = generateUlid();
        await db.execute(sql`
          INSERT INTO spa_provider_availability (id, tenant_id, provider_id, day_of_week, start_time, end_time, location_id)
          VALUES (${id}, ${tenantId}, ${prov.id}, ${dow}, ${st}::time, ${et}::time, ${locationId})
        `);
        availCount++;
      }
    }
    console.log(`  ${availCount} availability records created`);

    // ── 12. Provider Time Off ────────────────────────────────────
    console.log('-- Adding provider time off...');
    let timeOffCount = 0;
    const yearStart = new Date('2025-03-01');
    for (const prov of providerIds) {
      // 2-3 time-off entries per provider, scattered through the year
      const numTimeOff = randInt(2, 3);
      for (let j = 0; j < numTimeOff; j++) {
        const dayOffset = randInt(30, 330);
        const startDate = addDays(yearStart, dayOffset);
        const duration = randInt(1, 5);
        const endDate = addDays(startDate, duration);
        const id = generateUlid();
        await db.execute(sql`
          INSERT INTO spa_provider_time_off (id, tenant_id, provider_id, start_at, end_at, reason, is_all_day, status)
          VALUES (${id}, ${tenantId}, ${prov.id}, ${toTimestamptz(startDate)}, ${toTimestamptz(endDate)}, ${pick(['Vacation', 'Personal', 'Training', 'Medical'])}, true, 'approved')
        `);
        timeOffCount++;
      }
    }
    console.log(`  ${timeOffCount} time-off records created`);

    // ── 13. Provider Service Eligibility ──────────────────────────
    console.log('-- Setting provider service eligibility...');
    let eligCount = 0;
    for (const prov of providerIds) {
      const svcIds = providerServiceMap[prov.id] ?? [];
      for (const svcId of svcIds) {
        const id = generateUlid();
        const proficiency = pick(['standard', 'advanced', 'master']);
        await db.execute(sql`
          INSERT INTO spa_provider_services (id, tenant_id, provider_id, service_id, proficiency_level)
          VALUES (${id}, ${tenantId}, ${prov.id}, ${svcId}, ${proficiency})
        `);
        eligCount++;
      }
    }
    console.log(`  ${eligCount} eligibility records created`);

    // ── 14. Resource Schedules ───────────────────────────────────
    console.log('-- Creating resource schedules...');
    let schedCount = 0;
    for (const resType of Object.keys(resourceIds)) {
      for (const resId of resourceIds[resType]!) {
        for (let dow = 0; dow <= 6; dow++) {
          const id = generateUlid();
          const st = dow === 0 ? '10:00' : '08:00';
          const et = dow === 0 ? '16:00' : (dow === 6 ? '17:00' : '20:00');
          await db.execute(sql`
            INSERT INTO spa_resource_schedules (id, tenant_id, resource_id, day_of_week, start_time, end_time, is_active)
            VALUES (${id}, ${tenantId}, ${resId}, ${dow}, ${st}::time, ${et}::time, true)
          `);
          schedCount++;
        }
      }
    }
    console.log(`  ${schedCount} resource schedules created`);

    // ── 15. Commission Rules ─────────────────────────────────────
    console.log('-- Creating commission rules...');
    let commRuleCount = 0;
    for (const prov of providerIds) {
      const id = generateUlid();
      // Provider-level default commission
      await db.execute(sql`
        INSERT INTO spa_commission_rules (id, tenant_id, name, provider_id, commission_type, rate, applies_to, effective_from, priority, is_active)
        VALUES (${id}, ${tenantId}, ${prov.def.displayName + ' - Default'}, ${prov.id}, 'percentage', ${prov.def.commissionRate.toFixed(4)}, 'all', '2025-03-01', 10, true)
      `);
      commRuleCount++;
    }
    console.log(`  ${commRuleCount} commission rules created`);

    // ── 16. Package Definitions ──────────────────────────────────
    console.log('-- Creating package definitions...');
    const pkgDefIds: Array<{ id: string; def: PackageDef }> = [];
    for (const pkg of PACKAGES) {
      const id = generateUlid();
      pkgDefIds.push({ id, def: pkg });

      // Build includedServices JSONB: service IDs from the included categories
      const includedSvcIds: string[] = [];
      for (const cat of pkg.includedCategories) {
        includedSvcIds.push(...(servicesByCat[cat] ?? []));
      }

      await db.execute(sql`
        INSERT INTO spa_package_definitions (id, tenant_id, name, description, package_type, total_sessions, selling_price_cents, validity_days, included_services, is_active)
        VALUES (${id}, ${tenantId}, ${pkg.name}, ${pkg.description}, ${pkg.packageType}, ${pkg.totalSessions}, ${pkg.sellingPriceCents}, ${pkg.validityDays}, ${JSON.stringify(includedSvcIds)}, true)
      `);
    }
    console.log(`  ${PACKAGES.length} package definitions created`);

    // ── 17. Package Purchases ────────────────────────────────────
    console.log('-- Creating package purchases...');
    const pkgBalances: Array<{ id: string; custId: string; pkgDefId: string; sessionsTotal: number; sessionsUsed: number }> = [];
    // ~20% of named customers buy a package
    const namedCustomers = customerPool.filter(c => c !== null) as Array<{ id: string; name: string }>;
    for (const cust of namedCustomers) {
      if (rand() < 0.2) {
        const pkgDef = pick(pkgDefIds);
        const id = generateUlid();
        const purchaseDate = addDays(yearStart, randInt(0, 180));
        const expDate = addDays(purchaseDate, pkgDef.def.validityDays);
        const sessionsUsed = randInt(0, Math.min(3, pkgDef.def.totalSessions));
        const status = expDate < new Date() ? 'expired' : (sessionsUsed >= pkgDef.def.totalSessions ? 'exhausted' : 'active');

        await db.execute(sql`
          INSERT INTO spa_customer_packages (id, tenant_id, customer_id, package_def_id, purchase_date, expiration_date, sessions_total, sessions_used, status)
          VALUES (${id}, ${tenantId}, ${cust.id}, ${pkgDef.id}, ${bizDate(purchaseDate)}, ${bizDate(expDate)}, ${pkgDef.def.totalSessions}, ${sessionsUsed}, ${status})
        `);
        pkgBalances.push({ id, custId: cust.id, pkgDefId: pkgDef.id, sessionsTotal: pkgDef.def.totalSessions, sessionsUsed });
      }
    }
    console.log(`  ${pkgBalances.length} package purchases created`);

    // ══════════════════════════════════════════════════════════════
    // ══ APPOINTMENT GENERATION ═══════════════════════════════════
    // ══════════════════════════════════════════════════════════════

    console.log('\n-- Generating appointments (~1,800)...');

    const allServiceEntries = Object.values(serviceIds);
    const serviceWeights: number[] = allServiceEntries.map(s => {
      const cat = s.def.category;
      if (cat === 'Massage Therapy') return 35;
      if (cat === 'Facials') return 25;
      if (cat === 'Body Treatments') return 15;
      if (cat === 'Nail Services') return 15;
      return 10; // Wellness
    });

    // Track provider schedule conflicts (in-memory)
    // Map<providerId, Array<{start: number, end: number}>> per date string
    const providerBookings: Map<string, Map<string, Array<{ start: number; end: number }>>> = new Map();
    for (const p of providerIds) {
      providerBookings.set(p.id, new Map());
    }

    const allAppointments: Array<{
      id: string;
      appointmentNumber: string;
      customerId: string | null;
      guestName: string | null;
      providerId: string;
      resourceId: string;
      serviceEntry: { id: string; def: ServiceDef };
      startAt: Date;
      endAt: Date;
      status: string;
      priceCents: number;
      finalPriceCents: number;
      bookingSource: string;
    }> = [];

    let appointmentCounter = 0;
    const now = new Date();

    // Generate for 366 days starting 2025-03-01
    for (let dayOffset = 0; dayOffset < 366; dayOffset++) {
      const currentDate = addDays(yearStart, dayOffset);
      const dayOfWeek = currentDate.getDay(); // 0=Sun
      const month = currentDate.getMonth();

      // Calculate appointment count for this day
      const baseCount = 5;
      const seasonMult = getSeasonMultiplier(month);
      const dayMult = getDayMultiplier(dayOfWeek);
      const specialMult = isSpecialPeriod(currentDate);
      const targetCount = Math.round(baseCount * seasonMult * dayMult * specialMult);

      // Add some randomness
      const actualCount = Math.max(1, targetCount + randInt(-1, 2));

      for (let apptIdx = 0; apptIdx < actualCount; apptIdx++) {
        // Pick a service (weighted)
        const serviceEntry = weightedPick(allServiceEntries, serviceWeights);
        const svc = serviceEntry.def;

        // Find an eligible provider for this service
        const eligibleProviders = providerIds.filter(p => {
          const eligible = providerServiceMap[p.id] ?? [];
          return eligible.includes(serviceEntry.id);
        });
        if (eligibleProviders.length === 0) continue;
        const provider = pick(eligibleProviders);

        // Generate start time (business hours 8:00-18:00, avoid conflicts)
        const hour = randInt(8, 17);
        const minute = pick([0, 15, 30, 45]);
        const startAt = new Date(currentDate);
        startAt.setHours(hour, minute, 0, 0);
        const endAt = addMinutes(startAt, svc.durationMinutes + svc.bufferMinutes);

        // Check provider conflict
        const dateKey = bizDate(currentDate);
        const provBookings = providerBookings.get(provider.id)!;
        if (!provBookings.has(dateKey)) provBookings.set(dateKey, []);
        const dayBookings = provBookings.get(dateKey)!;
        const startMs = startAt.getTime();
        const endMs = endAt.getTime();
        const hasConflict = dayBookings.some(b => startMs < b.end && endMs > b.start);
        if (hasConflict) continue;

        // Record booking
        dayBookings.push({ start: startMs, end: endMs });

        // Pick resource
        const resPool = resourceIds[svc.resourceType] ?? [];
        const resourceId = resPool.length > 0 ? pick(resPool) : resPool[0] ?? '';

        // Pick customer (or walk-in)
        const customer = pick(customerPool);

        // Calculate pricing
        const isPeak = isPeakTime(hour, dayOfWeek);
        const basePrice = parseFloat(isPeak ? svc.peakPrice : svc.price);
        const priceCents = Math.round(basePrice * 100);
        // Small random discount for some
        const hasDiscount = rand() < 0.15;
        const discountCents = hasDiscount ? Math.round(priceCents * randBetween(0.05, 0.15)) : 0;
        const finalPriceCents = priceCents - discountCents;

        // Determine status
        let status: string;
        if (currentDate > now) {
          // Future: scheduled or confirmed
          status = rand() < 0.4 ? 'scheduled' : 'confirmed';
        } else {
          // Past: weighted distribution
          const r = rand();
          if (r < 0.70) status = 'checked_out';
          else if (r < 0.80) status = 'canceled';
          else if (r < 0.85) status = 'no_show';
          else status = 'completed'; // completed but not yet checked out
        }

        const bookingSource = rand() < 0.3 ? 'online' : (rand() < 0.1 ? 'phone' : 'walk_in');

        appointmentCounter++;
        const apptNumber = `SPA-${appointmentCounter.toString().padStart(6, '0')}`;
        const apptId = generateUlid();

        allAppointments.push({
          id: apptId,
          appointmentNumber: apptNumber,
          customerId: customer?.id ?? null,
          guestName: customer ? null : `Walk-in Guest ${randInt(100, 999)}`,
          providerId: provider.id,
          resourceId,
          serviceEntry,
          startAt,
          endAt,
          status,
          priceCents,
          finalPriceCents,
          bookingSource,
        });
      }
    }

    console.log(`  Generated ${allAppointments.length} appointments`);

    // ── 18. Batch Insert Appointments ────────────────────────────
    console.log('-- Inserting appointments (batch)...');
    const BATCH = 50;
    for (let i = 0; i < allAppointments.length; i += BATCH) {
      const batch = allAppointments.slice(i, i + BATCH);
      const values = batch.map(a => sql`(
        ${a.id}, ${tenantId}, ${a.appointmentNumber}, ${a.customerId}, ${a.guestName}, ${null}, ${null},
        ${locationId}, ${a.providerId}, ${a.resourceId},
        ${toTimestamptz(a.startAt)}, ${toTimestamptz(a.endAt)},
        ${a.status}, ${a.bookingSource}, ${0},
        ${a.status === 'checked_out' ? toTimestamptz(a.endAt) : null},
        ${a.status === 'canceled' ? toTimestamptz(addMinutes(a.startAt, -randInt(60, 1440))) : null},
        ${a.status === 'canceled' ? pick(['schedule_conflict', 'personal', 'illness', 'weather']) : null}
      )`);

      await db.execute(sql`
        INSERT INTO spa_appointments (
          id, tenant_id, appointment_number, customer_id, guest_name, guest_email, guest_phone,
          location_id, provider_id, resource_id,
          start_at, end_at,
          status, booking_source, deposit_amount_cents,
          checked_out_at, canceled_at, cancellation_reason
        ) VALUES ${sql.join(values, sql`, `)}
      `);

      if ((i + BATCH) % 200 === 0 || i + BATCH >= allAppointments.length) {
        process.stdout.write(`  ${Math.min(i + BATCH, allAppointments.length)}/${allAppointments.length}\r`);
      }
    }
    console.log(`  ${allAppointments.length} appointments inserted           `);

    // ── 19. Appointment Items ────────────────────────────────────
    console.log('-- Inserting appointment items...');
    const itemValues: Array<ReturnType<typeof sql>> = [];
    for (const a of allAppointments) {
      const itemId = generateUlid();
      const svc = a.serviceEntry.def;
      const itemStatus = a.status === 'checked_out' ? 'completed' : (a.status === 'canceled' ? 'canceled' : 'scheduled');

      itemValues.push(sql`(
        ${itemId}, ${tenantId}, ${a.id}, ${a.serviceEntry.id}, ${null},
        ${a.providerId}, ${a.resourceId},
        ${toTimestamptz(a.startAt)}, ${toTimestamptz(a.endAt)},
        ${a.priceCents}, ${Math.round(parseFloat(svc.memberPrice) * 100)}, ${a.finalPriceCents},
        ${a.priceCents - a.finalPriceCents}, ${itemStatus}
      )`);
    }

    for (let i = 0; i < itemValues.length; i += BATCH) {
      const batch = itemValues.slice(i, i + BATCH);
      await db.execute(sql`
        INSERT INTO spa_appointment_items (
          id, tenant_id, appointment_id, service_id, addon_id,
          provider_id, resource_id,
          start_at, end_at,
          price_cents, member_price_cents, final_price_cents,
          discount_amount_cents, status
        ) VALUES ${sql.join(batch, sql`, `)}
      `);
    }
    console.log(`  ${itemValues.length} appointment items inserted`);

    // ── 20. Appointment History (status lifecycle) ────────────────
    console.log('-- Inserting appointment history...');
    let histCount = 0;
    const histValues: Array<ReturnType<typeof sql>> = [];

    for (const a of allAppointments) {
      const statuses: Array<{ from: string | null; to: string; action: string }> = [];

      // All start with scheduling
      statuses.push({ from: null, to: 'scheduled', action: 'created' });

      if (a.status === 'canceled') {
        statuses.push({ from: 'scheduled', to: 'canceled', action: 'canceled' });
      } else if (a.status === 'no_show') {
        statuses.push({ from: 'scheduled', to: 'confirmed', action: 'confirmed' });
        statuses.push({ from: 'confirmed', to: 'no_show', action: 'marked_no_show' });
      } else if (a.status === 'confirmed') {
        statuses.push({ from: 'scheduled', to: 'confirmed', action: 'confirmed' });
      } else if (a.status === 'completed' || a.status === 'checked_out') {
        statuses.push({ from: 'scheduled', to: 'confirmed', action: 'confirmed' });
        statuses.push({ from: 'confirmed', to: 'checked_in', action: 'checked_in' });
        statuses.push({ from: 'checked_in', to: 'in_service', action: 'started' });
        statuses.push({ from: 'in_service', to: 'completed', action: 'completed' });
        if (a.status === 'checked_out') {
          statuses.push({ from: 'completed', to: 'checked_out', action: 'checked_out' });
        }
      }

      let eventTime = new Date(a.startAt.getTime() - 3600_000); // 1 hour before start
      for (const s of statuses) {
        const hId = generateUlid();
        histValues.push(sql`(
          ${hId}, ${tenantId}, ${a.id}, ${s.action}, ${s.from}, ${s.to},
          ${primaryUserId}, ${toTimestamptz(eventTime)}
        )`);
        histCount++;
        eventTime = addMinutes(eventTime, randInt(5, 30));
      }
    }

    for (let i = 0; i < histValues.length; i += BATCH) {
      const batch = histValues.slice(i, i + BATCH);
      await db.execute(sql`
        INSERT INTO spa_appointment_history (
          id, tenant_id, appointment_id, action, old_status, new_status,
          performed_by, performed_at
        ) VALUES ${sql.join(batch, sql`, `)}
      `);
    }
    console.log(`  ${histCount} history records inserted`);

    // ── 21. Commission Ledger ────────────────────────────────────
    console.log('-- Generating commission ledger...');
    let commCount = 0;
    const commValues: Array<ReturnType<typeof sql>> = [];

    for (const a of allAppointments) {
      if (a.status !== 'checked_out' && a.status !== 'completed') continue;

      const provider = providerIds.find(p => p.id === a.providerId);
      if (!provider) continue;

      const rate = provider.def.commissionRate;
      const commissionCents = Math.round(a.finalPriceCents * rate);
      const commStatus = rand() < 0.80 ? 'approved' : (rand() < 0.75 ? 'calculated' : 'paid');

      const commId = generateUlid();
      commValues.push(sql`(
        ${commId}, ${tenantId}, ${a.providerId}, ${a.id}, ${null},
        ${null}, 'percentage', ${a.finalPriceCents}, ${commissionCents},
        ${rate.toFixed(4)}, ${commStatus}, ${null}
      )`);
      commCount++;
    }

    for (let i = 0; i < commValues.length; i += BATCH) {
      const batch = commValues.slice(i, i + BATCH);
      await db.execute(sql`
        INSERT INTO spa_commission_ledger (
          id, tenant_id, provider_id, appointment_id, appointment_item_id,
          rule_id, commission_type, base_amount_cents, commission_amount_cents,
          rate_applied, status, pay_period
        ) VALUES ${sql.join(batch, sql`, `)}
      `);
    }
    console.log(`  ${commCount} commission entries created`);

    // ── 22. Package Redemptions ──────────────────────────────────
    console.log('-- Creating package redemptions...');
    let redemptionCount = 0;
    for (const balance of pkgBalances) {
      // Find checked_out appointments for this customer
      const custAppts = allAppointments.filter(
        a => a.customerId === balance.custId && (a.status === 'checked_out' || a.status === 'completed')
      );

      const redeemCount = Math.min(balance.sessionsUsed, custAppts.length);
      for (let j = 0; j < redeemCount; j++) {
        const appt = custAppts[j]!;
        const redId = generateUlid();
        await db.execute(sql`
          INSERT INTO spa_package_redemptions (id, tenant_id, balance_id, appointment_id, sessions_redeemed, redeemed_at)
          VALUES (${redId}, ${tenantId}, ${balance.id}, ${appt.id}, 1, ${toTimestamptz(appt.endAt)})
        `);
        redemptionCount++;
      }
    }
    console.log(`  ${redemptionCount} package redemptions created`);

    // ── 23. Daily Operations (sample) ────────────────────────────
    console.log('-- Creating sample daily operations...');
    let opsCount = 0;
    // Create a daily operations record for the first 30 days
    for (let d = 0; d < 30; d++) {
      const opsDate = addDays(yearStart, d);
      const opsId = generateUlid();
      await db.execute(sql`
        INSERT INTO spa_daily_operations (id, tenant_id, location_id, business_date, notes)
        VALUES (${opsId}, ${tenantId}, ${locationId}, ${bizDate(opsDate)}, ${d === 0 ? 'Opening day — grand opening' : null})
      `);
      opsCount++;
    }
    console.log(`  ${opsCount} daily operations created`);

    // ══════════════════════════════════════════════════════════════
    // ══ READ MODEL POPULATION ════════════════════════════════════
    // ══════════════════════════════════════════════════════════════

    console.log('\n-- Populating CQRS read models...');

    // Group appointments by date for aggregation
    const apptsByDate: Map<string, typeof allAppointments> = new Map();
    for (const a of allAppointments) {
      const d = bizDate(a.startAt);
      if (!apptsByDate.has(d)) apptsByDate.set(d, []);
      apptsByDate.get(d)!.push(a);
    }

    // ── rm_spa_daily_operations ──────────────────────────────────
    console.log('  Populating rm_spa_daily_operations...');
    let dailyCount = 0;
    for (const [dateStr, dayAppts] of apptsByDate) {
      const completed = dayAppts.filter(a => a.status === 'checked_out' || a.status === 'completed');
      const canceled = dayAppts.filter(a => a.status === 'canceled');
      const noShows = dayAppts.filter(a => a.status === 'no_show');
      const walkIns = dayAppts.filter(a => !a.customerId);
      const online = dayAppts.filter(a => a.bookingSource === 'online');
      const totalRev = completed.reduce((s, a) => s + a.finalPriceCents, 0) / 100;
      const avgDuration = completed.length > 0
        ? Math.round(completed.reduce((s, a) => s + a.serviceEntry.def.durationMinutes, 0) / completed.length)
        : 0;

      // Operating hours: 10 hours, resources: treatment rooms (4) + others
      const totalSlots = 10 * 4; // simplified: 10 hours * 4 rooms
      const usedSlots = completed.length;
      const utilizationPct = totalSlots > 0 ? Math.min(100, (usedSlots / totalSlots) * 100) : 0;

      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO rm_spa_daily_operations (
          id, tenant_id, location_id, business_date,
          appointment_count, completed_count, canceled_count, no_show_count, walk_in_count, online_booking_count,
          total_revenue, service_revenue, avg_appointment_duration, utilization_pct
        ) VALUES (
          ${id}, ${tenantId}, ${locationId}, ${dateStr},
          ${dayAppts.length}, ${completed.length}, ${canceled.length}, ${noShows.length}, ${walkIns.length}, ${online.length},
          ${totalRev.toFixed(4)}, ${totalRev.toFixed(4)}, ${avgDuration}, ${utilizationPct.toFixed(2)}
        )
        ON CONFLICT (tenant_id, location_id, business_date) DO UPDATE SET
          appointment_count = EXCLUDED.appointment_count,
          completed_count = EXCLUDED.completed_count,
          canceled_count = EXCLUDED.canceled_count,
          no_show_count = EXCLUDED.no_show_count,
          walk_in_count = EXCLUDED.walk_in_count,
          online_booking_count = EXCLUDED.online_booking_count,
          total_revenue = EXCLUDED.total_revenue,
          service_revenue = EXCLUDED.service_revenue,
          avg_appointment_duration = EXCLUDED.avg_appointment_duration,
          utilization_pct = EXCLUDED.utilization_pct,
          updated_at = NOW()
      `);
      dailyCount++;
    }
    console.log(`    ${dailyCount} daily summary records`);

    // ── rm_spa_provider_metrics ──────────────────────────────────
    console.log('  Populating rm_spa_provider_metrics...');
    let provMetricCount = 0;
    // Group by provider+date
    const provDateMap: Map<string, typeof allAppointments> = new Map();
    for (const a of allAppointments) {
      const key = `${a.providerId}|${bizDate(a.startAt)}`;
      if (!provDateMap.has(key)) provDateMap.set(key, []);
      provDateMap.get(key)!.push(a);
    }

    for (const [key, appts] of provDateMap) {
      const [providerId, dateStr] = key.split('|') as [string, string];
      const completed = appts.filter(a => a.status === 'checked_out' || a.status === 'completed');
      const canceled = appts.filter(a => a.status === 'canceled');
      const noShows = appts.filter(a => a.status === 'no_show');
      const totalRev = completed.reduce((s, a) => s + a.finalPriceCents, 0) / 100;

      const provider = providerIds.find(p => p.id === providerId);
      const commRate = provider?.def.commissionRate ?? 0.30;
      const commTotal = totalRev * commRate;
      const tipTotal = completed.reduce((s, _) => s + (rand() < 0.6 ? randBetween(5, 30) : 0), 0);

      const avgDuration = completed.length > 0
        ? Math.round(completed.reduce((s, a) => s + a.serviceEntry.def.durationMinutes, 0) / completed.length)
        : 0;

      const uniqueClients = new Set(completed.filter(a => a.customerId).map(a => a.customerId));

      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO rm_spa_provider_metrics (
          id, tenant_id, provider_id, business_date,
          appointment_count, completed_count, canceled_count, no_show_count,
          total_revenue, commission_total, tip_total, avg_service_duration,
          client_count
        ) VALUES (
          ${id}, ${tenantId}, ${providerId}, ${dateStr},
          ${appts.length}, ${completed.length}, ${canceled.length}, ${noShows.length},
          ${totalRev.toFixed(4)}, ${commTotal.toFixed(4)}, ${tipTotal.toFixed(4)}, ${avgDuration},
          ${uniqueClients.size}
        )
        ON CONFLICT (tenant_id, provider_id, business_date) DO UPDATE SET
          appointment_count = EXCLUDED.appointment_count,
          completed_count = EXCLUDED.completed_count,
          total_revenue = EXCLUDED.total_revenue,
          commission_total = EXCLUDED.commission_total,
          tip_total = EXCLUDED.tip_total,
          updated_at = NOW()
      `);
      provMetricCount++;
    }
    console.log(`    ${provMetricCount} provider metric records`);

    // ── rm_spa_service_metrics ───────────────────────────────────
    console.log('  Populating rm_spa_service_metrics...');
    let svcMetricCount = 0;
    const svcDateMap: Map<string, typeof allAppointments> = new Map();
    for (const a of allAppointments) {
      const key = `${a.serviceEntry.id}|${bizDate(a.startAt)}`;
      if (!svcDateMap.has(key)) svcDateMap.set(key, []);
      svcDateMap.get(key)!.push(a);
    }

    for (const [key, appts] of svcDateMap) {
      const [serviceId, dateStr] = key.split('|') as [string, string];
      const completed = appts.filter(a => a.status === 'checked_out' || a.status === 'completed');
      const canceled = appts.filter(a => a.status === 'canceled');
      const totalRev = completed.reduce((s, a) => s + a.finalPriceCents, 0) / 100;
      const avgPriceCents = completed.length > 0
        ? Math.round(completed.reduce((s, a) => s + a.finalPriceCents, 0) / completed.length)
        : 0;

      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO rm_spa_service_metrics (
          id, tenant_id, service_id, business_date,
          booking_count, completed_count, canceled_count,
          total_revenue, avg_price_cents
        ) VALUES (
          ${id}, ${tenantId}, ${serviceId}, ${dateStr},
          ${appts.length}, ${completed.length}, ${canceled.length},
          ${totalRev.toFixed(4)}, ${avgPriceCents}
        )
        ON CONFLICT (tenant_id, service_id, business_date) DO UPDATE SET
          booking_count = EXCLUDED.booking_count,
          completed_count = EXCLUDED.completed_count,
          total_revenue = EXCLUDED.total_revenue,
          avg_price_cents = EXCLUDED.avg_price_cents,
          updated_at = NOW()
      `);
      svcMetricCount++;
    }
    console.log(`    ${svcMetricCount} service metric records`);

    // ── rm_spa_client_metrics ────────────────────────────────────
    console.log('  Populating rm_spa_client_metrics...');
    let clientMetricCount = 0;
    const clientDateMap: Map<string, typeof allAppointments> = new Map();
    for (const a of allAppointments) {
      if (!a.customerId) continue;
      const key = `${a.customerId}|${bizDate(a.startAt)}`;
      if (!clientDateMap.has(key)) clientDateMap.set(key, []);
      clientDateMap.get(key)!.push(a);
    }

    for (const [key, appts] of clientDateMap) {
      const [customerId, dateStr] = key.split('|') as [string, string];
      const completed = appts.filter(a => a.status === 'checked_out' || a.status === 'completed');
      const canceled = appts.filter(a => a.status === 'canceled');
      const noShows = appts.filter(a => a.status === 'no_show');
      const totalSpend = completed.reduce((s, a) => s + a.finalPriceCents, 0) / 100;

      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO rm_spa_client_metrics (
          id, tenant_id, customer_id, business_date,
          visit_count, total_spend, service_count,
          cancel_count, no_show_count, last_visit_date
        ) VALUES (
          ${id}, ${tenantId}, ${customerId}, ${dateStr},
          ${completed.length}, ${totalSpend.toFixed(4)}, ${completed.length},
          ${canceled.length}, ${noShows.length}, ${dateStr}
        )
        ON CONFLICT (tenant_id, customer_id, business_date) DO UPDATE SET
          visit_count = EXCLUDED.visit_count,
          total_spend = EXCLUDED.total_spend,
          service_count = EXCLUDED.service_count,
          cancel_count = EXCLUDED.cancel_count,
          no_show_count = EXCLUDED.no_show_count,
          last_visit_date = EXCLUDED.last_visit_date,
          updated_at = NOW()
      `);
      clientMetricCount++;
    }
    console.log(`    ${clientMetricCount} client metric records`);

    // ══════════════════════════════════════════════════════════════
    // ══ SUMMARY ══════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════

    console.log('\n' + '='.repeat(50));
    console.log('  SPA SEED SUMMARY');
    console.log('='.repeat(50));

    // Appointments by status
    const statusCounts: Record<string, number> = {};
    for (const a of allAppointments) {
      statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    }
    console.log('\n  Appointments by status:');
    for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${status.padEnd(15)} ${count}`);
    }

    // Total revenue
    const completedAppts = allAppointments.filter(a => a.status === 'checked_out' || a.status === 'completed');
    const totalRevenue = completedAppts.reduce((s, a) => s + a.finalPriceCents, 0) / 100;
    console.log(`\n  Total revenue: $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    // Appointments per provider
    console.log('\n  Appointments per provider:');
    for (const prov of providerIds) {
      const count = allAppointments.filter(a => a.providerId === prov.id).length;
      console.log(`    ${prov.def.displayName.padEnd(20)} ${count}`);
    }

    // Top services
    const svcCounts: Record<string, number> = {};
    for (const a of allAppointments) {
      const name = a.serviceEntry.def.displayName;
      svcCounts[name] = (svcCounts[name] ?? 0) + 1;
    }
    console.log('\n  Top 5 services:');
    const sorted = Object.entries(svcCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [name, count] of sorted) {
      console.log(`    ${name.padEnd(25)} ${count}`);
    }

    // Packages
    console.log(`\n  Packages: ${pkgBalances.length} purchased, ${redemptionCount} redeemed`);
    console.log(`  Commissions: ${commCount} entries`);

    // Read models
    console.log(`\n  Read models populated:`);
    console.log(`    rm_spa_daily_operations:  ${dailyCount} records`);
    console.log(`    rm_spa_provider_metrics:  ${provMetricCount} records`);
    console.log(`    rm_spa_service_metrics:   ${svcMetricCount} records`);
    console.log(`    rm_spa_client_metrics:    ${clientMetricCount} records`);

    console.log('\n' + '='.repeat(50));
    console.log('  Spa seed complete!');
    console.log('='.repeat(50) + '\n');

  } finally {
    await client.end();
  }
}

seedSpa().catch((err) => {
  console.error('Spa seed failed:', err);
  process.exit(1);
});
