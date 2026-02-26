import dotenv from 'dotenv';

// --remote flag loads .env.remote first so seed targets production Supabase
const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '../../.env.remote', override: true });
}
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createCipheriv, randomBytes } from 'node:crypto';
import { generateUlid } from '@oppsera/shared';
import {
  tenants,
  locations,
  users,
  memberships,
  roles,
  rolePermissions,
  roleAssignments,
  entitlements,
  taxCategories,
  catalogCategories,
  catalogItems,
  catalogModifierGroups,
  catalogModifiers,
  catalogItemModifierGroups,
  catalogLocationPrices,
  taxRates,
  taxGroups,
  taxGroupRates,
  catalogItemLocationTaxGroups,
  inventoryItems,
  customers,
  customerIdentifiers,
  customerActivityLog,
  membershipPlans,
  customerMemberships,
  billingAccounts,
  billingAccountMembers,
  customerContacts,
  customerPreferences,
  customerAuthAccounts,
  terminalLocations,
  terminals,
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  pmsProperties,
  pmsRoomTypes,
  pmsRooms,
  pmsRatePlans,
  pmsRatePlanPrices,
  pmsGuests,
  pmsReservations,
  pmsFolios,
  pmsFolioEntries,
  tags,
  orders,
  orderLines,
  orderLineTaxes,
  orderCounters,
  tenders,
  rmDailySales,
  rmItemSales,
  fnbKitchenStations,
} from './schema';

async function seed() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`Seeding database (${target}): ${masked}\n`);

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);

  // ── Clean existing seed data ─────────────────────────────────
  console.log('Cleaning existing data...');
  // order_line_taxes has no FK cascade, truncate explicitly
  await client`TRUNCATE order_line_taxes, order_counters CASCADE`;
  await client`TRUNCATE tenants, users CASCADE`;
  console.log('Truncated all tables via tenants, users CASCADE.\n');

  // ── Create tenant ──────────────────────────────────────────────
  const tenantId = generateUlid();
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Sunset Golf & Grill',
    slug: 'sunset-golf',
    status: 'active',
    businessTier: 'MID_MARKET',
  });
  console.log(`Tenant: ${tenantId} (Sunset Golf & Grill)`);

  // ── Create locations (site → venue hierarchy) ─────────────────
  const siteId = generateUlid();
  const locationIds = [generateUlid(), generateUlid()];

  // Site = physical address (files taxes, has address)
  await db.insert(locations).values({
    id: siteId,
    tenantId,
    name: 'Sunset Golf Resort',
    locationType: 'site',
    timezone: 'America/New_York',
    addressLine1: '100 Fairway Dr',
    city: 'Sunset Beach',
    state: 'NC',
    postalCode: '28468',
    country: 'US',
  });

  // Venues = operational units under the site
  await db.insert(locations).values([
    {
      id: locationIds[0],
      tenantId,
      name: 'Main Clubhouse',
      locationType: 'venue',
      parentLocationId: siteId,
      timezone: 'America/New_York',
    },
    {
      id: locationIds[1],
      tenantId,
      name: 'South Course Pro Shop',
      locationType: 'venue',
      parentLocationId: siteId,
      timezone: 'America/New_York',
    },
  ]);
  console.log(`Site:     ${siteId} (Sunset Golf Resort)`);
  console.log(`Venue 1:  ${locationIds[0]} (Main Clubhouse)`);
  console.log(`Venue 2:  ${locationIds[1]} (South Course Pro Shop)`);

  // ── Create user ────────────────────────────────────────────────
  const userId = generateUlid();
  await db.insert(users).values({
    id: userId,
    email: 'admin@sunsetgolf.test',
    name: 'Alex Admin',
    isPlatformAdmin: false,
  });
  console.log(`User: ${userId} (Alex Admin)`);

  // ── Create membership ──────────────────────────────────────────
  await db.insert(memberships).values({
    tenantId,
    userId,
    status: 'active',
  });
  console.log('Membership: active');

  // ── Create system roles ────────────────────────────────────────
  const roleDefinitions = [
    {
      name: 'owner',
      description: 'Full access to everything',
      permissions: ['*'],
    },
    {
      name: 'admin',
      description: 'Full access, scoped to assigned locations',
      permissions: ['*'],
    },
    {
      name: 'manager',
      description: 'Manage daily operations',
      permissions: [
        'catalog.*',
        'orders.*',
        'inventory.*',
        'customers.*',
        'pos_fnb.*',
        'accounting.*',
        'ap.*',
        'ar.*',
        'reports.view',
        'reports.export',
        'reports.custom.view',
        'reports.custom.manage',
        'settings.view',
        'room_layouts.view',
        'room_layouts.manage',
        'pms.property.view',
        'pms.rooms.view',
        'pms.reservations.view',
        'pms.reservations.create',
        'pms.reservations.edit',
        'pms.reservations.cancel',
        'pms.front_desk.check_in',
        'pms.front_desk.check_out',
        'pms.front_desk.no_show',
        'pms.calendar.view',
        'pms.calendar.move',
        'pms.calendar.resize',
        'pms.housekeeping.view',
        'pms.guests.view',
        'pms.guests.manage',
        'pms.folio.view',
        'pms.folio.post_charges',
        'pms.folio.post_payments',
        'pms.rates.view',
      ],
    },
    {
      name: 'cashier',
      description: 'Point of sale operations',
      permissions: [
        'orders.create',
        'orders.view',
        'tenders.create',
        'tenders.view',
        'customers.view',
        'customers.create',
        'catalog.view',
        'pos_fnb.floor_plan.view',
        'pos_fnb.tabs.view',
        'pos_fnb.tabs.manage',
        'pos_fnb.kds.view',
        'pos_fnb.payments.manage',
        'pos_fnb.host.view',
      ],
    },
    {
      name: 'supervisor',
      description: 'Supervise shift operations, override prices, manage discounts',
      permissions: [
        'orders.create',
        'orders.view',
        'orders.void',
        'tenders.create',
        'tenders.view',
        'price.override',
        'discounts.apply',
        'charges.manage',
        'cash.drawer',
        'shift.manage',
        'returns.create',
        'catalog.view',
        'inventory.view',
        'customers.view',
        'customers.create',
        'reports.view',
        'pos_fnb.floor_plan.view',
        'pos_fnb.tabs.view',
        'pos_fnb.tabs.manage',
        'pos_fnb.kds.view',
        'pos_fnb.payments.manage',
        'pos_fnb.tips.manage',
        'pos_fnb.menu.manage',
        'pos_fnb.host.view',
        'pos_fnb.host.manage',
        'pos_fnb.host.notifications',
        'room_layouts.view',
        'room_layouts.manage',
      ],
    },
    {
      name: 'server',
      description: 'F&B server — manage tables, tabs, and orders',
      permissions: [
        'orders.create',
        'orders.view',
        'tenders.create',
        'tenders.view',
        'catalog.view',
        'customers.view',
        'pos_fnb.floor_plan.view',
        'pos_fnb.tabs.view',
        'pos_fnb.tabs.manage',
        'pos_fnb.kds.view',
        'pos_fnb.payments.manage',
        'pos_fnb.host.view',
      ],
    },
    {
      name: 'staff',
      description: 'General staff with basic read access',
      permissions: [
        'catalog.view',
        'orders.view',
        'customers.view',
        'pos_fnb.floor_plan.view',
        'pos_fnb.host.view',
      ],
    },
    {
      name: 'housekeeper',
      description: 'Housekeeping staff with PMS room and cleaning access',
      permissions: [
        'pms.property.view',
        'pms.rooms.view',
        'pms.housekeeping.view',
        'pms.housekeeping.complete',
        'pms.housekeeping.manage',
        'pms.housekeepers.manage',
        'pos_fnb.floor_plan.view',
      ],
    },
    {
      name: 'viewer',
      description: 'Read-only access',
      permissions: [
        'catalog.view',
        'orders.view',
        'inventory.view',
        'customers.view',
        'reports.view',
        'pos_fnb.floor_plan.view',
        'pos_fnb.tabs.view',
        'pos_fnb.kds.view',
        'accounting.view',
        'room_layouts.view',
        'pms.property.view',
        'pms.rooms.view',
        'pms.reservations.view',
        'pms.calendar.view',
        'pms.housekeeping.view',
        'pms.guests.view',
        'pms.folio.view',
        'pms.rates.view',
      ],
    },
  ];

  const roleIds: Record<string, string> = {};

  for (const roleDef of roleDefinitions) {
    const roleId = generateUlid();
    roleIds[roleDef.name] = roleId;

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      name: roleDef.name,
      description: roleDef.description,
      isSystem: true,
    });

    await db.insert(rolePermissions).values(
      roleDef.permissions.map((permission) => ({
        roleId,
        permission,
      })),
    );
  }
  console.log(`Roles: ${Object.keys(roleIds).length} system roles created`);

  // ── Assign owner role to user ──────────────────────────────────
  await db.insert(roleAssignments).values({
    tenantId,
    userId,
    roleId: roleIds['owner']!,
    locationId: null,
  });
  console.log('Role Assignment: owner (tenant-wide)');

  // ── Create entitlements (V1 + golf_ops for dev) ───────────────
  const moduleKeys = [
    'platform_core',
    'catalog',
    'orders',
    'pos_retail',
    'pos_fnb',
    'payments',
    'inventory',
    'customers',
    'reporting',
    'golf_ops',
    'golf_reporting',
    'semantic',
    'room_layouts',
    'pms',
    'accounting',
    'ap',
    'ar',
    'club_membership',
  ];

  const entitlementLimits = { max_seats: 25, max_locations: 10, max_devices: 10 };

  await db.insert(entitlements).values(
    moduleKeys.map((moduleKey) => ({
      tenantId,
      moduleKey,
      planTier: 'standard',
      isEnabled: true,
      accessMode: 'full' as const,
      limits: entitlementLimits,
    })),
  );
  console.log(`Entitlements: ${moduleKeys.length} modules enabled`);

  // ── Payment Provider + Merchant Accounts (CardPointe UAT) ─────
  // Uses the CardPointe Gateway Developer Guide test credentials:
  //   Site: fts-uat  |  MID: 496160873888  |  Username: testing  |  Password: testing123
  // See: https://developer.cardpointe.com/cardconnect-api
  const providerId = generateUlid();
  await db.insert(paymentProviders).values({
    id: providerId,
    tenantId,
    code: 'cardpointe',
    displayName: 'CardPointe',
    providerType: 'gateway',
    isActive: true,
    config: { site: 'fts-uat', sandbox: true },
  });

  // Encrypt credentials (inline — avoids cross-package dep on @oppsera/module-payments)
  const encKey = process.env.PAYMENT_ENCRYPTION_KEY;
  if (encKey) {
    const credPayload = JSON.stringify({
      site: 'fts-uat',
      username: 'testing',
      password: 'testing123',
      authorizationKey: '',
      achUsername: '',
      achPassword: '',
      fundingUsername: '',
      fundingPassword: '',
    });
    const keyBuf = encKey.length === 64 ? Buffer.from(encKey, 'hex') : Buffer.from(encKey, 'base64');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
    const encrypted = Buffer.concat([cipher.update(credPayload, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, authTag, encrypted]).toString('base64');

    const credId = generateUlid();
    await db.insert(paymentProviderCredentials).values({
      id: credId,
      tenantId,
      providerId,
      locationId: null,
      credentialsEncrypted: blob,
      isSandbox: true,
      isActive: true,
    });
    console.log('Payment Credentials: encrypted and stored (CardPointe UAT)');
  } else {
    console.log('Payment Credentials: SKIPPED (PAYMENT_ENCRYPTION_KEY not set)');
  }

  // Merchant Account — primary Ecom MID from CardPointe developer docs
  const ecomAccountId = generateUlid();
  await db.insert(paymentMerchantAccounts).values({
    id: ecomAccountId,
    tenantId,
    providerId,
    locationId: null,
    merchantId: '496160873888',
    displayName: 'Sunset Golf — Ecom',
    isDefault: true,
    isActive: true,
    hsn: null,
    achMerchantId: null,
    fundingMerchantId: null,
    useForCardSwipe: true,
    readerBeep: true,
    isProduction: false,
    allowManualEntry: true,
    tipOnDevice: false,
  });
  console.log('Merchant Account: 496160873888 (Sunset Golf — Ecom)');

  // ── Catalog: Tax Categories ───────────────────────────────────
  const taxCatIds = {
    salesTax: generateUlid(),
    foodTax: generateUlid(),
    alcohol: generateUlid(),
    exempt: generateUlid(),
  };

  await db.insert(taxCategories).values([
    { id: taxCatIds.salesTax, tenantId, name: 'Standard Sales Tax', rate: '0.0700' },
    { id: taxCatIds.foodTax, tenantId, name: 'Prepared Food Tax', rate: '0.0800' },
    { id: taxCatIds.alcohol, tenantId, name: 'Alcohol Tax', rate: '0.1000' },
    { id: taxCatIds.exempt, tenantId, name: 'Tax Exempt', rate: '0.0000' },
  ]);
  console.log('Tax Categories: 4 created');

  // ── Catalog: Categories ──────────────────────────────────────
  const catIds = {
    apparel: generateUlid(),
    food: generateUlid(),
    beverages: generateUlid(),
    golfEquip: generateUlid(),
    greenFees: generateUlid(),
  };

  await db.insert(catalogCategories).values([
    { id: catIds.apparel, tenantId, name: 'Apparel', sortOrder: 1 },
    { id: catIds.food, tenantId, name: 'Food & Snacks', sortOrder: 2 },
    { id: catIds.beverages, tenantId, name: 'Beverages', sortOrder: 3 },
    { id: catIds.golfEquip, tenantId, name: 'Golf Equipment', sortOrder: 4 },
    { id: catIds.greenFees, tenantId, name: 'Green Fees', sortOrder: 5 },
  ]);
  console.log('Catalog Categories: 5 created');

  // ── Catalog: Items ───────────────────────────────────────────
  const itemIds = {
    polo: generateUlid(),
    hotdog: generateUlid(),
    burger: generateUlid(),
    soda: generateUlid(),
    beer: generateUlid(),
    gloves: generateUlid(),
    balls: generateUlid(),
    greenFee18: generateUlid(),
    greenFee9: generateUlid(),
    cartRental: generateUlid(),
  };

  await db.insert(catalogItems).values([
    {
      id: itemIds.polo,
      tenantId,
      categoryId: catIds.apparel,
      sku: 'POLO-001',
      name: 'Logo Polo Shirt',
      description: 'Sunset Golf & Grill embroidered polo',
      itemType: 'retail',
      defaultPrice: '49.99',
      cost: '22.00',
      taxCategoryId: taxCatIds.salesTax,
      isTrackable: true,
      createdBy: userId,
    },
    {
      id: itemIds.hotdog,
      tenantId,
      categoryId: catIds.food,
      sku: 'FOOD-001',
      name: 'Hot Dog',
      itemType: 'food',
      defaultPrice: '5.99',
      cost: '1.50',
      taxCategoryId: taxCatIds.foodTax,
      createdBy: userId,
    },
    {
      id: itemIds.burger,
      tenantId,
      categoryId: catIds.food,
      sku: 'FOOD-002',
      name: 'Clubhouse Burger',
      description: 'Half-pound Angus burger with fries',
      itemType: 'food',
      defaultPrice: '14.99',
      cost: '5.00',
      taxCategoryId: taxCatIds.foodTax,
      createdBy: userId,
    },
    {
      id: itemIds.soda,
      tenantId,
      categoryId: catIds.beverages,
      sku: 'BEV-001',
      name: 'Fountain Soda',
      itemType: 'beverage',
      defaultPrice: '2.99',
      cost: '0.35',
      taxCategoryId: taxCatIds.foodTax,
      createdBy: userId,
    },
    {
      id: itemIds.beer,
      tenantId,
      categoryId: catIds.beverages,
      sku: 'BEV-002',
      name: 'Draft Beer',
      description: 'House draft, 16oz',
      itemType: 'beverage',
      defaultPrice: '7.99',
      cost: '2.00',
      taxCategoryId: taxCatIds.alcohol,
      createdBy: userId,
    },
    {
      id: itemIds.gloves,
      tenantId,
      categoryId: catIds.golfEquip,
      sku: 'GOLF-001',
      name: 'Golf Glove',
      itemType: 'retail',
      defaultPrice: '24.99',
      cost: '10.00',
      taxCategoryId: taxCatIds.salesTax,
      isTrackable: true,
      createdBy: userId,
    },
    {
      id: itemIds.balls,
      tenantId,
      categoryId: catIds.golfEquip,
      sku: 'GOLF-002',
      name: 'Golf Balls (Dozen)',
      itemType: 'retail',
      defaultPrice: '39.99',
      cost: '18.00',
      taxCategoryId: taxCatIds.salesTax,
      isTrackable: true,
      createdBy: userId,
    },
    {
      id: itemIds.greenFee18,
      tenantId,
      categoryId: catIds.greenFees,
      sku: 'GF-18',
      name: '18-Hole Green Fee',
      itemType: 'green_fee',
      defaultPrice: '75.00',
      taxCategoryId: taxCatIds.exempt,
      createdBy: userId,
    },
    {
      id: itemIds.greenFee9,
      tenantId,
      categoryId: catIds.greenFees,
      sku: 'GF-9',
      name: '9-Hole Green Fee',
      itemType: 'green_fee',
      defaultPrice: '45.00',
      taxCategoryId: taxCatIds.exempt,
      createdBy: userId,
    },
    {
      id: itemIds.cartRental,
      tenantId,
      categoryId: catIds.greenFees,
      sku: 'RENT-001',
      name: 'Cart Rental',
      itemType: 'rental',
      defaultPrice: '25.00',
      taxCategoryId: taxCatIds.exempt,
      createdBy: userId,
    },
  ]);
  console.log('Catalog Items: 10 created');

  // ── Catalog: Modifier Groups + Modifiers ─────────────────────
  const mgIds = {
    burgerTemp: generateUlid(),
    burgerToppings: generateUlid(),
    sodaSize: generateUlid(),
  };

  await db.insert(catalogModifierGroups).values([
    {
      id: mgIds.burgerTemp,
      tenantId,
      name: 'Burger Temperature',
      selectionType: 'single',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
    },
    {
      id: mgIds.burgerToppings,
      tenantId,
      name: 'Burger Toppings',
      selectionType: 'multiple',
      isRequired: false,
      minSelections: 0,
      maxSelections: 5,
    },
    {
      id: mgIds.sodaSize,
      tenantId,
      name: 'Drink Size',
      selectionType: 'single',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
    },
  ]);

  await db.insert(catalogModifiers).values([
    { tenantId, modifierGroupId: mgIds.burgerTemp, name: 'Rare', priceAdjustment: '0', sortOrder: 1 },
    { tenantId, modifierGroupId: mgIds.burgerTemp, name: 'Medium Rare', priceAdjustment: '0', sortOrder: 2 },
    { tenantId, modifierGroupId: mgIds.burgerTemp, name: 'Medium', priceAdjustment: '0', sortOrder: 3 },
    { tenantId, modifierGroupId: mgIds.burgerTemp, name: 'Medium Well', priceAdjustment: '0', sortOrder: 4 },
    { tenantId, modifierGroupId: mgIds.burgerTemp, name: 'Well Done', priceAdjustment: '0', sortOrder: 5 },
    { tenantId, modifierGroupId: mgIds.burgerToppings, name: 'Cheese', priceAdjustment: '1.50', sortOrder: 1 },
    { tenantId, modifierGroupId: mgIds.burgerToppings, name: 'Bacon', priceAdjustment: '2.00', sortOrder: 2 },
    { tenantId, modifierGroupId: mgIds.burgerToppings, name: 'Avocado', priceAdjustment: '2.50', sortOrder: 3 },
    { tenantId, modifierGroupId: mgIds.burgerToppings, name: 'Fried Egg', priceAdjustment: '1.50', sortOrder: 4 },
    { tenantId, modifierGroupId: mgIds.sodaSize, name: 'Small', priceAdjustment: '0', sortOrder: 1 },
    { tenantId, modifierGroupId: mgIds.sodaSize, name: 'Medium', priceAdjustment: '0.50', sortOrder: 2 },
    { tenantId, modifierGroupId: mgIds.sodaSize, name: 'Large', priceAdjustment: '1.00', sortOrder: 3 },
  ]);

  // Link modifier groups to items
  await db.insert(catalogItemModifierGroups).values([
    { catalogItemId: itemIds.burger, modifierGroupId: mgIds.burgerTemp },
    { catalogItemId: itemIds.burger, modifierGroupId: mgIds.burgerToppings },
    { catalogItemId: itemIds.soda, modifierGroupId: mgIds.sodaSize },
  ]);
  console.log('Modifier Groups: 3 created (12 modifiers)');

  // ── Catalog: Location Price Overrides ────────────────────────
  await db.insert(catalogLocationPrices).values([
    { tenantId, catalogItemId: itemIds.greenFee18, locationId: locationIds[1]!, price: '65.00' },
    { tenantId, catalogItemId: itemIds.greenFee9, locationId: locationIds[1]!, price: '40.00' },
    { tenantId, catalogItemId: itemIds.beer, locationId: locationIds[1]!, price: '6.99' },
  ]);
  console.log('Location Price Overrides: 3 created (South Course Pro Shop)');

  // ── Tax Rates (tenant-scoped, reusable) ────────────────────────
  const rateIds = {
    miState: generateUlid(),
    geneseeCounty: generateUlid(),
    cityRestaurant: generateUlid(),
  };

  await db.insert(taxRates).values([
    { id: rateIds.miState, tenantId, name: 'MI State Sales Tax', rateDecimal: '0.0600', createdBy: userId },
    { id: rateIds.geneseeCounty, tenantId, name: 'Genesee County Tax', rateDecimal: '0.0150', createdBy: userId },
    { id: rateIds.cityRestaurant, tenantId, name: 'City Restaurant Tax', rateDecimal: '0.0075', createdBy: userId },
  ]);
  console.log('Tax Rates: 3 created');

  // ── Tax Groups (location-scoped) ──────────────────────────────
  const tgIds = {
    mainRetail: generateUlid(),
    mainFood: generateUlid(),
    mainAlcohol: generateUlid(),
    mainExempt: generateUlid(),
    southRetail: generateUlid(),
    southFood: generateUlid(),
  };

  await db.insert(taxGroups).values([
    { id: tgIds.mainRetail, tenantId, locationId: locationIds[0]!, name: 'Retail Tax', createdBy: userId },
    { id: tgIds.mainFood, tenantId, locationId: locationIds[0]!, name: 'Food & Bev Tax', createdBy: userId },
    { id: tgIds.mainAlcohol, tenantId, locationId: locationIds[0]!, name: 'Alcohol Tax', createdBy: userId },
    { id: tgIds.mainExempt, tenantId, locationId: locationIds[0]!, name: 'Tax Exempt', createdBy: userId },
  ]);

  await db.insert(taxGroups).values([
    { id: tgIds.southRetail, tenantId, locationId: locationIds[1]!, name: 'Retail Tax', createdBy: userId },
    { id: tgIds.southFood, tenantId, locationId: locationIds[1]!, name: 'Food & Bev Tax', createdBy: userId },
  ]);
  console.log('Tax Groups: 6 created (4 Main Clubhouse, 2 South Course)');

  // ── Tax Group Rates ────────────────────────────────────────────
  await db.insert(taxGroupRates).values([
    { tenantId, taxGroupId: tgIds.mainRetail, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainRetail, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.cityRestaurant, sortOrder: 2 },
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.cityRestaurant, sortOrder: 2 },
    { tenantId, taxGroupId: tgIds.southRetail, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.southFood, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.southFood, taxRateId: rateIds.cityRestaurant, sortOrder: 1 },
  ]);
  console.log('Tax Group Rates: 11 associations created');

  // ── Item Tax Group Assignments (per location) ─────────────────
  await db.insert(catalogItemLocationTaxGroups).values([
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.polo, taxGroupId: tgIds.mainRetail },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.gloves, taxGroupId: tgIds.mainRetail },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.balls, taxGroupId: tgIds.mainRetail },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.hotdog, taxGroupId: tgIds.mainFood },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.burger, taxGroupId: tgIds.mainFood },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.soda, taxGroupId: tgIds.mainFood },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.beer, taxGroupId: tgIds.mainAlcohol },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.greenFee18, taxGroupId: tgIds.mainExempt },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.greenFee9, taxGroupId: tgIds.mainExempt },
    { tenantId, locationId: locationIds[0]!, catalogItemId: itemIds.cartRental, taxGroupId: tgIds.mainExempt },
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.polo, taxGroupId: tgIds.southRetail },
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.gloves, taxGroupId: tgIds.southRetail },
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.beer, taxGroupId: tgIds.southFood },
  ]);
  console.log('Item Tax Group Assignments: 13 created');

  // ── Inventory Items (for trackable catalog items) ──────────────
  const trackableItems = [
    { catalogItemId: itemIds.polo, name: 'Logo Polo Shirt' },
    { catalogItemId: itemIds.gloves, name: 'Golf Glove' },
    { catalogItemId: itemIds.balls, name: 'Golf Balls (Dozen)' },
  ];

  for (const loc of locationIds) {
    await db.insert(inventoryItems).values(
      trackableItems.map((item) => ({
        tenantId,
        locationId: loc!,
        catalogItemId: item.catalogItemId!,
        name: item.name,
        itemType: 'retail',
        trackInventory: true,
        reorderPoint: '5',
        reorderQuantity: '20',
      })),
    );
  }
  console.log('Inventory Items: 6 created (3 items × 2 locations)');

  // ── Customers ──────────────────────────────────────────────────
  const custIds = {
    johnson: generateUlid(),
    smith: generateUlid(),
    williams: generateUlid(),
    acme: generateUlid(),
  };

  await db.insert(customers).values([
    {
      id: custIds.johnson,
      tenantId,
      type: 'person',
      firstName: 'Robert',
      lastName: 'Johnson',
      displayName: 'Robert Johnson',
      email: 'rjohnson@example.com',
      phone: '910-555-0101',
      status: 'active',
      createdBy: userId,
    },
    {
      id: custIds.smith,
      tenantId,
      type: 'person',
      firstName: 'Sarah',
      lastName: 'Smith',
      displayName: 'Sarah Smith',
      email: 'ssmith@example.com',
      phone: '910-555-0102',
      status: 'active',
      createdBy: userId,
    },
    {
      id: custIds.williams,
      tenantId,
      type: 'person',
      firstName: 'James',
      lastName: 'Williams',
      displayName: 'James Williams',
      email: 'jwilliams@example.com',
      phone: '910-555-0103',
      status: 'active',
      createdBy: userId,
    },
    {
      id: custIds.acme,
      tenantId,
      type: 'organization',
      organizationName: 'Acme Corp',
      displayName: 'Acme Corp',
      email: 'billing@acmecorp.example.com',
      phone: '910-555-0200',
      status: 'active',
      createdBy: userId,
    },
  ]);
  console.log('Customers: 4 created (3 persons + 1 organization)');

  // ── Customer Identifiers ───────────────────────────────────────
  await db.insert(customerIdentifiers).values([
    { tenantId, customerId: custIds.johnson, type: 'member_number', value: 'MEM-001', isActive: true },
    { tenantId, customerId: custIds.smith, type: 'member_number', value: 'MEM-002', isActive: true },
    { tenantId, customerId: custIds.williams, type: 'barcode', value: '9781234567890', isActive: true },
  ]);
  console.log('Customer Identifiers: 3 created');

  // ── Customer Contacts ──────────────────────────────────────────
  await db.insert(customerContacts).values([
    { tenantId, customerId: custIds.johnson, contactType: 'email', value: 'rjohnson@example.com', isPrimary: true, isVerified: true },
    { tenantId, customerId: custIds.johnson, contactType: 'phone', value: '910-555-0101', isPrimary: true, isVerified: false },
    { tenantId, customerId: custIds.smith, contactType: 'email', value: 'ssmith@example.com', isPrimary: true, isVerified: true },
  ]);
  console.log('Customer Contacts: 3 created');

  // ── Customer Preferences ───────────────────────────────────────
  await db.insert(customerPreferences).values([
    { tenantId, customerId: custIds.johnson, category: 'food_beverage', key: 'favorite_drink', value: 'Draft Beer', source: 'manual', updatedBy: userId },
    { tenantId, customerId: custIds.johnson, category: 'golf', key: 'preferred_tee_time', value: '8:00 AM', source: 'manual', updatedBy: userId },
    { tenantId, customerId: custIds.smith, category: 'dietary', key: 'allergy', value: 'Gluten-free', source: 'manual', updatedBy: userId },
  ]);
  console.log('Customer Preferences: 3 created');

  // ── Customer Portal Auth Accounts ──────────────────────────────
  // Password: member123 (bcrypt cost 12)
  const portalPasswordHash = '$2a$12$Y8t.gvYUXTSSakAeeeDG2ujzHJms6Kp.JyG/BGlQzWNnpNCNk7ei2';
  await db.insert(customerAuthAccounts).values([
    { tenantId, customerId: custIds.johnson, provider: 'portal', passwordHash: portalPasswordHash, isActive: true },
    { tenantId, customerId: custIds.smith, provider: 'portal', passwordHash: portalPasswordHash, isActive: true },
    { tenantId, customerId: custIds.williams, provider: 'portal', passwordHash: portalPasswordHash, isActive: true },
    { tenantId, customerId: custIds.acme, provider: 'portal', passwordHash: portalPasswordHash, isActive: true },
  ]);
  console.log('Customer Auth Accounts: 4 created (password: member123)');

  // ── Customer Activity Log ──────────────────────────────────────
  await db.insert(customerActivityLog).values([
    { tenantId, customerId: custIds.johnson, activityType: 'system', title: 'Customer created', createdBy: userId },
    { tenantId, customerId: custIds.smith, activityType: 'system', title: 'Customer created', createdBy: userId },
    { tenantId, customerId: custIds.williams, activityType: 'system', title: 'Customer created', createdBy: userId },
    { tenantId, customerId: custIds.acme, activityType: 'system', title: 'Customer created', createdBy: userId },
  ]);
  console.log('Customer Activity: 4 entries created');

  // ── Membership Plans ───────────────────────────────────────────
  const planIds = {
    gold: generateUlid(),
    silver: generateUlid(),
  };

  await db.insert(membershipPlans).values([
    {
      id: planIds.gold,
      tenantId,
      name: 'Gold Membership',
      description: 'Premium membership with full privileges',
      billingInterval: 'monthly',
      priceCents: 29900,
      privileges: { discount_percentage: 15, free_range_balls: true, guest_passes: 2 },
      isActive: true,
    },
    {
      id: planIds.silver,
      tenantId,
      name: 'Silver Membership',
      description: 'Standard membership with basic privileges',
      billingInterval: 'monthly',
      priceCents: 14900,
      privileges: { discount_percentage: 10, free_range_balls: false, guest_passes: 1 },
      isActive: true,
    },
  ]);
  console.log('Membership Plans: 2 created (Gold, Silver)');

  // ── Billing Accounts ───────────────────────────────────────────
  const billingAcctIds = {
    johnson: generateUlid(),
    acme: generateUlid(),
  };

  await db.insert(billingAccounts).values([
    {
      id: billingAcctIds.johnson,
      tenantId,
      primaryCustomerId: custIds.johnson,
      name: 'Johnson House Account',
      creditLimitCents: 500000,
      currentBalanceCents: 0,
      status: 'active',
    },
    {
      id: billingAcctIds.acme,
      tenantId,
      primaryCustomerId: custIds.acme,
      name: 'Acme Corp Account',
      creditLimitCents: 2000000,
      currentBalanceCents: 0,
      status: 'active',
    },
  ]);
  console.log('Billing Accounts: 2 created');

  // ── Billing Account Members ────────────────────────────────────
  await db.insert(billingAccountMembers).values([
    {
      tenantId,
      billingAccountId: billingAcctIds.johnson,
      customerId: custIds.johnson,
      role: 'owner',
      chargeAllowed: true,
    },
    {
      tenantId,
      billingAccountId: billingAcctIds.acme,
      customerId: custIds.acme,
      role: 'owner',
      chargeAllowed: true,
    },
  ]);
  console.log('Billing Account Members: 2 created');

  // ── Customer Memberships (enrollments) ─────────────────────────
  await db.insert(customerMemberships).values([
    {
      tenantId,
      customerId: custIds.johnson,
      planId: planIds.gold,
      billingAccountId: billingAcctIds.johnson,
      status: 'active',
      startDate: '2025-01-01',
      renewalDate: '2026-01-01',
    },
    {
      tenantId,
      customerId: custIds.smith,
      planId: planIds.silver,
      billingAccountId: billingAcctIds.johnson,
      status: 'active',
      startDate: '2025-03-15',
      renewalDate: '2026-03-15',
    },
  ]);
  console.log('Customer Memberships: 2 enrolled (Johnson=Gold, Smith=Silver)');

  // ── Profit Centers & Terminals ─────────────────────────────────
  const profitCenterIds = {
    main: generateUlid(),
    south: generateUlid(),
  };

  await db.insert(terminalLocations).values([
    {
      id: profitCenterIds.main,
      tenantId,
      locationId: locationIds[0]!,
      title: 'Profit Center 1',
      code: 'PC1',
      description: 'Main Clubhouse profit center',
      tipsApplicable: true,
      isActive: true,
      sortOrder: 0,
    },
    {
      id: profitCenterIds.south,
      tenantId,
      locationId: locationIds[1]!,
      title: 'Profit Center 2',
      code: 'PC2',
      description: 'South Course Pro Shop profit center',
      tipsApplicable: true,
      isActive: true,
      sortOrder: 1,
    },
  ]);
  console.log(`Profit Center 1: ${profitCenterIds.main} (Main Clubhouse)`);
  console.log(`Profit Center 2: ${profitCenterIds.south} (South Course Pro Shop)`);

  const terminalIds = {
    pos1: generateUlid(),
    pos2: generateUlid(),
  };

  await db.insert(terminals).values([
    {
      id: terminalIds.pos1,
      tenantId,
      terminalLocationId: profitCenterIds.main,
      locationId: locationIds[0]!,
      title: 'POS 1',
      terminalNumber: 1,
      isActive: true,
    },
    {
      id: terminalIds.pos2,
      tenantId,
      terminalLocationId: profitCenterIds.south,
      locationId: locationIds[1]!,
      title: 'POS 1',
      terminalNumber: 1,
      isActive: true,
    },
  ]);
  console.log(`Terminal 1: ${terminalIds.pos1} (POS 1 @ Main Clubhouse)`);
  console.log(`Terminal 2: ${terminalIds.pos2} (POS 1 @ South Course Pro Shop)`);

  // ══════════════════════════════════════════════════════════════
  // ══ Orders & Sales History ═════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  console.log('\n── Orders & Sales History ─────────────────────');

  // Helper: generate business date string (past N days)
  const bizDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  // Helper: generate a past timestamp
  const pastTimestamp = (daysAgo: number, hourOfDay: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hourOfDay, Math.floor(Math.random() * 60), 0, 0);
    return d;
  };

  // Tax rate for calculations — MI state 6% + Genesee county 1.5% = 7.5% for retail
  // Food: 6% + 1.5% + 0.75% city = 8.25%
  // Alcohol: same as food 8.25%
  const RETAIL_TAX_RATE = 0.075;
  const FOOD_TAX_RATE = 0.0825;
  const ALCOHOL_TAX_RATE = 0.0825;

  // Item catalog for order generation (prices in cents)
  const orderableItems = [
    { id: itemIds.polo, name: 'Logo Polo Shirt', sku: 'POLO-001', type: 'retail', priceCents: 4999, costCents: 2200, taxRate: RETAIL_TAX_RATE, catName: 'Apparel', catId: catIds.apparel },
    { id: itemIds.hotdog, name: 'Hot Dog', sku: 'FOOD-001', type: 'food', priceCents: 599, costCents: 150, taxRate: FOOD_TAX_RATE, catName: 'Food & Snacks', catId: catIds.food },
    { id: itemIds.burger, name: 'Clubhouse Burger', sku: 'FOOD-002', type: 'food', priceCents: 1499, costCents: 500, taxRate: FOOD_TAX_RATE, catName: 'Food & Snacks', catId: catIds.food },
    { id: itemIds.soda, name: 'Fountain Soda', sku: 'BEV-001', type: 'beverage', priceCents: 299, costCents: 35, taxRate: FOOD_TAX_RATE, catName: 'Beverages', catId: catIds.beverages },
    { id: itemIds.beer, name: 'Draft Beer', sku: 'BEV-002', type: 'beverage', priceCents: 799, costCents: 200, taxRate: ALCOHOL_TAX_RATE, catName: 'Beverages', catId: catIds.beverages },
    { id: itemIds.gloves, name: 'Golf Glove', sku: 'GOLF-001', type: 'retail', priceCents: 2499, costCents: 1000, taxRate: RETAIL_TAX_RATE, catName: 'Golf Equipment', catId: catIds.golfEquip },
    { id: itemIds.balls, name: 'Golf Balls (Dozen)', sku: 'GOLF-002', type: 'retail', priceCents: 3999, costCents: 1800, taxRate: RETAIL_TAX_RATE, catName: 'Golf Equipment', catId: catIds.golfEquip },
    { id: itemIds.greenFee18, name: '18-Hole Green Fee', sku: 'GF-18', type: 'green_fee', priceCents: 7500, costCents: 0, taxRate: 0, catName: 'Green Fees', catId: catIds.greenFees },
    { id: itemIds.greenFee9, name: '9-Hole Green Fee', sku: 'GF-9', type: 'green_fee', priceCents: 4500, costCents: 0, taxRate: 0, catName: 'Green Fees', catId: catIds.greenFees },
    { id: itemIds.cartRental, name: 'Cart Rental', sku: 'RENT-001', type: 'rental', priceCents: 2500, costCents: 0, taxRate: 0, catName: 'Green Fees', catId: catIds.greenFees },
  ];

  // Order templates — realistic combos customers typically buy
  type OrderTemplate = { items: Array<{ idx: number; qty: number }>; customerIdx?: number };
  const orderTemplates: OrderTemplate[] = [
    // Golfer: 18 holes + cart + beer
    { items: [{ idx: 7, qty: 1 }, { idx: 9, qty: 1 }, { idx: 4, qty: 2 }] },
    // Golfer: 9 holes + cart + soda
    { items: [{ idx: 8, qty: 1 }, { idx: 9, qty: 1 }, { idx: 3, qty: 1 }] },
    // Lunch: burger + soda
    { items: [{ idx: 2, qty: 1 }, { idx: 3, qty: 1 }] },
    // Lunch: 2 hot dogs + 2 beers
    { items: [{ idx: 1, qty: 2 }, { idx: 4, qty: 2 }] },
    // Pro shop: polo + golf balls
    { items: [{ idx: 0, qty: 1 }, { idx: 6, qty: 1 }] },
    // Pro shop: glove + balls
    { items: [{ idx: 5, qty: 1 }, { idx: 6, qty: 1 }] },
    // Quick: just a beer
    { items: [{ idx: 4, qty: 1 }] },
    // Quick: hot dog + soda
    { items: [{ idx: 1, qty: 1 }, { idx: 3, qty: 1 }] },
    // Big day: 18 holes + cart + burger + 3 beers
    { items: [{ idx: 7, qty: 1 }, { idx: 9, qty: 1 }, { idx: 2, qty: 1 }, { idx: 4, qty: 3 }] },
    // Family: 2 burgers + 2 sodas + hot dog
    { items: [{ idx: 2, qty: 2 }, { idx: 3, qty: 2 }, { idx: 1, qty: 1 }] },
    // Pro shop only: polo
    { items: [{ idx: 0, qty: 1 }] },
    // Golf + lunch: 18 holes + cart + 2 hot dogs + 2 sodas
    { items: [{ idx: 7, qty: 1 }, { idx: 9, qty: 1 }, { idx: 1, qty: 2 }, { idx: 3, qty: 2 }] },
  ];

  // Generate orders for past 14 days, 3-6 orders per day, across both locations
  const allOrderInserts: Array<{
    id: string; tenantId: string; locationId: string; orderNumber: string;
    status: string; source: string; version: number;
    customerId: string | null; subtotal: number; taxTotal: number;
    discountTotal: number; serviceChargeTotal: number; roundingAdjustment: number;
    total: number; taxExempt: boolean; businessDate: string;
    terminalId: string; employeeId: string; createdBy: string; updatedBy: string;
    placedAt: Date; paidAt: Date | null; voidedAt: Date | null; voidReason: string | null; voidedBy: string | null;
  }> = [];
  const allLineInserts: Array<{
    id: string; tenantId: string; locationId: string; orderId: string;
    sortOrder: number; catalogItemId: string; catalogItemName: string;
    catalogItemSku: string; itemType: string; qty: string;
    unitPrice: number; lineSubtotal: number; lineTax: number; lineTotal: number;
    subDepartmentId: string | null; taxGroupId: string | null;
    createdAt: Date;
  }> = [];
  const allTaxInserts: Array<{
    tenantId: string; orderLineId: string; taxName: string;
    rateDecimal: string; amount: number;
  }> = [];
  const allTenderInserts: Array<{
    id: string; tenantId: string; locationId: string; orderId: string;
    tenderType: string; tenderSequence: number; amount: number;
    tipAmount: number; changeGiven: number; amountGiven: number;
    currency: string; status: string; businessDate: string;
    source: string; employeeId: string; terminalId: string; createdBy: string;
    createdAt: Date;
  }> = [];

  // Track per-location order number counters
  const orderNumberCounters: Record<string, number> = {
    [locationIds[0]!]: 0,
    [locationIds[1]!]: 0,
  };

  // Track daily aggregates for reporting read models
  const dailyAgg: Record<string, {
    orderCount: number; grossSales: number; taxTotal: number; netSales: number;
    discountTotal: number; tenderCash: number; tenderCard: number;
    voidCount: number; voidTotal: number; locationId: string;
  }> = {};
  const itemAgg: Record<string, {
    catalogItemId: string; catalogItemName: string; categoryName: string;
    quantitySold: number; grossRevenue: number; locationId: string;
  }> = {};

  // Customer IDs for random assignment
  const customerIdPool = [custIds.johnson, custIds.smith, custIds.williams, null, null, null];

  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const bd = bizDate(daysAgo);
    const ordersPerDay = 3 + Math.floor(Math.abs(Math.sin(daysAgo * 2.7)) * 4); // 3-6 orders

    for (let orderIdx = 0; orderIdx < ordersPerDay; orderIdx++) {
      // Alternate locations (70% main clubhouse, 30% pro shop)
      const isMain = orderIdx % 3 !== 2;
      const locId = isMain ? locationIds[0]! : locationIds[1]!;
      const termId = isMain ? terminalIds.pos1 : terminalIds.pos2;

      // Pick template
      const template = orderTemplates[(daysAgo * 7 + orderIdx) % orderTemplates.length]!;

      // Occasionally void an order (~8%)
      const isVoided = (daysAgo * 7 + orderIdx) % 13 === 0;

      // Assign customer to ~40% of orders
      const custId = customerIdPool[(daysAgo + orderIdx) % customerIdPool.length] ?? null;

      // Order number
      orderNumberCounters[locId]!++;
      const orderNum = `ORD-${String(orderNumberCounters[locId]).padStart(3, '0')}`;

      const orderId = generateUlid();
      const hourOfDay = 8 + (orderIdx * 2) % 10; // spread across 8am-6pm
      const ts = pastTimestamp(daysAgo, hourOfDay);

      let orderSubtotal = 0;
      let orderTaxTotal = 0;
      let sortOrder = 0;

      // Create line items
      for (const lineSpec of template.items) {
        const item = orderableItems[lineSpec.idx]!;
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

        // Tax breakdown per line (simplified — single combined rate)
        if (item.taxRate > 0) {
          allTaxInserts.push({
            tenantId,
            orderLineId: lineId,
            taxName: item.type === 'retail' ? 'Retail Sales Tax' : 'Food & Bev Tax',
            rateDecimal: item.taxRate.toFixed(4),
            amount: lineTax,
          });
        }

        // Item-level aggregation for read models
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
          itemAgg[itemAggKey]!.grossRevenue += lineSubtotal / 100; // dollars
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

      // Create tender for paid orders
      if (!isVoided) {
        const isCash = orderIdx % 3 === 0;
        const tipAmount = isCash ? 0 : Math.round(orderTotal * 0.18);
        const tenderAmount = orderTotal + tipAmount;
        const amountGiven = isCash ? Math.ceil(orderTotal / 100) * 100 : tenderAmount; // round up to dollar for cash
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
      }

      // Daily aggregation for read models
      const dailyKey = `${bd}|${locId}`;
      if (!dailyAgg[dailyKey]) {
        dailyAgg[dailyKey] = {
          orderCount: 0, grossSales: 0, taxTotal: 0, netSales: 0,
          discountTotal: 0, tenderCash: 0, tenderCard: 0,
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
        day.netSales += orderSubtotal / 100; // net = gross - discounts (no discounts in seed)
        if (allTenderInserts.length > 0) {
          const lastTender = allTenderInserts[allTenderInserts.length - 1]!;
          if (lastTender.orderId === orderId) {
            if (lastTender.tenderType === 'cash') {
              day.tenderCash += lastTender.amount / 100;
            } else {
              day.tenderCard += lastTender.amount / 100;
            }
          }
        }
      }
    }
  }

  // Batch insert orders
  for (let i = 0; i < allOrderInserts.length; i += 50) {
    await db.insert(orders).values(allOrderInserts.slice(i, i + 50));
  }
  console.log(`Orders: ${allOrderInserts.length} created (14 days of history)`);

  // Batch insert order lines
  for (let i = 0; i < allLineInserts.length; i += 100) {
    await db.insert(orderLines).values(allLineInserts.slice(i, i + 100));
  }
  console.log(`Order Lines: ${allLineInserts.length} created`);

  // Batch insert order line taxes
  if (allTaxInserts.length > 0) {
    for (let i = 0; i < allTaxInserts.length; i += 100) {
      await db.insert(orderLineTaxes).values(allTaxInserts.slice(i, i + 100));
    }
  }
  console.log(`Order Line Taxes: ${allTaxInserts.length} created`);

  // Batch insert tenders
  for (let i = 0; i < allTenderInserts.length; i += 50) {
    await db.insert(tenders).values(allTenderInserts.slice(i, i + 50));
  }
  console.log(`Tenders: ${allTenderInserts.length} created`);

  // Set order counters
  for (const [locId, lastNum] of Object.entries(orderNumberCounters)) {
    await db.insert(orderCounters).values({ tenantId, locationId: locId, lastNumber: lastNum });
  }
  console.log(`Order Counters: 2 location counters set`);

  // ── Reporting Read Models ───────────────────────────────────────
  console.log('\n── Reporting Read Models ──────────────────────');

  // Daily sales read model
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
      voidCount: agg.voidCount,
      voidTotal: agg.voidTotal.toFixed(4),
      avgOrderValue: avgOrderValue.toFixed(4),
    };
  });

  if (dailySalesRows.length > 0) {
    await db.insert(rmDailySales).values(dailySalesRows);
  }
  console.log(`rm_daily_sales: ${dailySalesRows.length} rows`);

  // Item sales read model
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

  if (itemSalesRows.length > 0) {
    for (let i = 0; i < itemSalesRows.length; i += 100) {
      await db.insert(rmItemSales).values(itemSalesRows.slice(i, i + 100));
    }
  }
  console.log(`rm_item_sales: ${itemSalesRows.length} rows`);

  // ══════════════════════════════════════════════════════════════
  // ══ PMS — Sunset Bar & Grill Resort ══════════════════════════
  // ══════════════════════════════════════════════════════════════
  console.log('\n── PMS Seed Data ──────────────────────────────');

  // Helper: date string offset from today
  const today = new Date();
  const dateStr = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  // ── PMS Property ──────────────────────────────────────────────
  const propertyId = generateUlid();
  await db.insert(pmsProperties).values({
    id: propertyId,
    tenantId,
    name: 'Sunset Bar & Grill Resort',
    timezone: 'America/New_York',
    currency: 'USD',
    taxRatePct: '12.00',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    nightAuditTime: '03:00',
    slug: 'sunset-resort',
    addressJson: {
      line1: '100 Fairway Dr',
      city: 'Sunset Beach',
      state: 'NC',
      postalCode: '28468',
      country: 'US',
    },
  });
  console.log(`Property:   ${propertyId} (Sunset Bar & Grill Resort)`);

  // ── Room Types ────────────────────────────────────────────────
  const roomTypeIds = {
    standard: generateUlid(),
    deluxeKing: generateUlid(),
    oceanSuite: generateUlid(),
    familySuite: generateUlid(),
    penthouse: generateUlid(),
  };

  await db.insert(pmsRoomTypes).values([
    {
      id: roomTypeIds.standard,
      tenantId,
      propertyId,
      code: 'STD',
      name: 'Standard Double',
      description: 'Comfortable room with two double beds, garden view',
      maxAdults: 2,
      maxChildren: 2,
      maxOccupancy: 4,
      bedsJson: [{ type: 'double', count: 2 }],
      amenitiesJson: ['wifi', 'tv', 'mini_fridge', 'coffee_maker', 'iron'],
      sortOrder: 0,
    },
    {
      id: roomTypeIds.deluxeKing,
      tenantId,
      propertyId,
      code: 'DLX',
      name: 'Deluxe King',
      description: 'Spacious room with king bed, partial ocean view, sitting area',
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 3,
      bedsJson: [{ type: 'king', count: 1 }],
      amenitiesJson: ['wifi', 'tv', 'mini_fridge', 'coffee_maker', 'iron', 'balcony', 'robes'],
      sortOrder: 1,
    },
    {
      id: roomTypeIds.oceanSuite,
      tenantId,
      propertyId,
      code: 'OCS',
      name: 'Ocean View Suite',
      description: 'Premium suite with full ocean view, separate living area, wet bar',
      maxAdults: 2,
      maxChildren: 2,
      maxOccupancy: 4,
      bedsJson: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
      amenitiesJson: ['wifi', 'tv', 'mini_bar', 'coffee_maker', 'iron', 'balcony', 'robes', 'wet_bar', 'ocean_view'],
      sortOrder: 2,
    },
    {
      id: roomTypeIds.familySuite,
      tenantId,
      propertyId,
      code: 'FAM',
      name: 'Family Suite',
      description: 'Two-bedroom suite with kitchenette, perfect for families',
      maxAdults: 4,
      maxChildren: 3,
      maxOccupancy: 6,
      bedsJson: [{ type: 'king', count: 1 }, { type: 'twin', count: 2 }],
      amenitiesJson: ['wifi', 'tv', 'kitchenette', 'coffee_maker', 'iron', 'balcony', 'washer_dryer'],
      sortOrder: 3,
    },
    {
      id: roomTypeIds.penthouse,
      tenantId,
      propertyId,
      code: 'PH',
      name: 'Penthouse Suite',
      description: 'Top-floor luxury suite with panoramic ocean view, jacuzzi, private terrace',
      maxAdults: 2,
      maxChildren: 2,
      maxOccupancy: 4,
      bedsJson: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
      amenitiesJson: ['wifi', 'tv', 'mini_bar', 'coffee_maker', 'iron', 'private_terrace', 'robes', 'jacuzzi', 'ocean_view', 'butler_service'],
      sortOrder: 4,
    },
  ]);
  console.log('Room Types: 5 created (STD, DLX, OCS, FAM, PH)');

  // ── Rooms (20 total) ──────────────────────────────────────────
  // 8 Standard, 5 Deluxe King, 3 Ocean Suite, 3 Family Suite, 1 Penthouse
  const roomDefs: Array<{ id: string; number: string; typeId: string; floor: string; view?: string; wing?: string }> = [
    // Standard — Ground & 2nd floor, garden wing
    { id: generateUlid(), number: '101', typeId: roomTypeIds.standard, floor: '1', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '102', typeId: roomTypeIds.standard, floor: '1', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '103', typeId: roomTypeIds.standard, floor: '1', view: 'pool', wing: 'garden' },
    { id: generateUlid(), number: '104', typeId: roomTypeIds.standard, floor: '1', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '201', typeId: roomTypeIds.standard, floor: '2', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '202', typeId: roomTypeIds.standard, floor: '2', view: 'pool', wing: 'garden' },
    { id: generateUlid(), number: '203', typeId: roomTypeIds.standard, floor: '2', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '204', typeId: roomTypeIds.standard, floor: '2', view: 'garden', wing: 'garden' },
    // Deluxe King — 2nd & 3rd floor, ocean wing
    { id: generateUlid(), number: '205', typeId: roomTypeIds.deluxeKing, floor: '2', view: 'partial_ocean', wing: 'ocean' },
    { id: generateUlid(), number: '206', typeId: roomTypeIds.deluxeKing, floor: '2', view: 'partial_ocean', wing: 'ocean' },
    { id: generateUlid(), number: '301', typeId: roomTypeIds.deluxeKing, floor: '3', view: 'partial_ocean', wing: 'ocean' },
    { id: generateUlid(), number: '302', typeId: roomTypeIds.deluxeKing, floor: '3', view: 'partial_ocean', wing: 'ocean' },
    { id: generateUlid(), number: '303', typeId: roomTypeIds.deluxeKing, floor: '3', view: 'ocean', wing: 'ocean' },
    // Ocean Suite — 3rd & 4th floor
    { id: generateUlid(), number: '304', typeId: roomTypeIds.oceanSuite, floor: '3', view: 'ocean', wing: 'ocean' },
    { id: generateUlid(), number: '401', typeId: roomTypeIds.oceanSuite, floor: '4', view: 'ocean', wing: 'ocean' },
    { id: generateUlid(), number: '402', typeId: roomTypeIds.oceanSuite, floor: '4', view: 'ocean', wing: 'ocean' },
    // Family Suite — 2nd floor, garden wing
    { id: generateUlid(), number: '210', typeId: roomTypeIds.familySuite, floor: '2', view: 'pool', wing: 'garden' },
    { id: generateUlid(), number: '211', typeId: roomTypeIds.familySuite, floor: '2', view: 'garden', wing: 'garden' },
    { id: generateUlid(), number: '310', typeId: roomTypeIds.familySuite, floor: '3', view: 'pool', wing: 'garden' },
    // Penthouse — top floor
    { id: generateUlid(), number: '501', typeId: roomTypeIds.penthouse, floor: '5', view: 'panoramic_ocean', wing: 'ocean' },
  ];

  const roomMap: Record<string, string> = {};
  await db.insert(pmsRooms).values(
    roomDefs.map((r) => {
      roomMap[r.number] = r.id;
      return {
        id: r.id,
        tenantId,
        propertyId,
        roomTypeId: r.typeId,
        roomNumber: r.number,
        floor: r.floor,
        status: 'VACANT_CLEAN',
        viewType: r.view ?? null,
        wing: r.wing ?? null,
        featuresJson: {},
      };
    }),
  );
  console.log('Rooms:      20 created (8 STD, 5 DLX, 3 OCS, 3 FAM, 1 PH)');

  // ── Rate Plans ────────────────────────────────────────────────
  const ratePlanIds = {
    rack: generateUlid(),
    winter: generateUlid(),
    aaa: generateUlid(),
    golf: generateUlid(),
  };

  await db.insert(pmsRatePlans).values([
    {
      id: ratePlanIds.rack,
      tenantId,
      propertyId,
      code: 'RACK',
      name: 'Rack Rate',
      description: 'Standard published rate',
      isDefault: true,
    },
    {
      id: ratePlanIds.winter,
      tenantId,
      propertyId,
      code: 'WINTER',
      name: 'Winter Escape',
      description: '15% off rack rate — Feb through Mar',
    },
    {
      id: ratePlanIds.aaa,
      tenantId,
      propertyId,
      code: 'AAA',
      name: 'AAA / AARP Discount',
      description: '10% off rack rate for AAA & AARP members',
    },
    {
      id: ratePlanIds.golf,
      tenantId,
      propertyId,
      code: 'GOLF',
      name: 'Golf Getaway Package',
      description: 'Room + 18 holes + cart for two — best value',
    },
  ]);
  console.log('Rate Plans: 4 created (RACK, WINTER, AAA, GOLF)');

  // ── Rate Plan Prices (per room type, seasonal) ────────────────
  // Rack rates: STD=$159, DLX=$219, OCS=$329, FAM=$289, PH=$599
  // Winter: ~15% off. AAA: ~10% off. Golf: includes $150 golf pkg value.
  const rackRates: Record<string, number> = {
    [roomTypeIds.standard]: 15900,
    [roomTypeIds.deluxeKing]: 21900,
    [roomTypeIds.oceanSuite]: 32900,
    [roomTypeIds.familySuite]: 28900,
    [roomTypeIds.penthouse]: 59900,
  };

  const ratePriceRows: Array<{
    tenantId: string;
    ratePlanId: string;
    roomTypeId: string;
    startDate: string;
    endDate: string;
    nightlyBaseCents: number;
  }> = [];

  // Current season window: today through 6 months out
  const seasonStart = dateStr(0);
  const seasonEnd = dateStr(180);

  for (const [rtId, rackCents] of Object.entries(rackRates)) {
    // Rack
    ratePriceRows.push({
      tenantId,
      ratePlanId: ratePlanIds.rack,
      roomTypeId: rtId,
      startDate: seasonStart,
      endDate: seasonEnd,
      nightlyBaseCents: rackCents,
    });
    // Winter (15% off)
    ratePriceRows.push({
      tenantId,
      ratePlanId: ratePlanIds.winter,
      roomTypeId: rtId,
      startDate: seasonStart,
      endDate: seasonEnd,
      nightlyBaseCents: Math.round(rackCents * 0.85),
    });
    // AAA (10% off)
    ratePriceRows.push({
      tenantId,
      ratePlanId: ratePlanIds.aaa,
      roomTypeId: rtId,
      startDate: seasonStart,
      endDate: seasonEnd,
      nightlyBaseCents: Math.round(rackCents * 0.90),
    });
    // Golf (rack + $150 golf value baked in, net ~$50 premium over rack for package value)
    ratePriceRows.push({
      tenantId,
      ratePlanId: ratePlanIds.golf,
      roomTypeId: rtId,
      startDate: seasonStart,
      endDate: seasonEnd,
      nightlyBaseCents: rackCents + 5000,
    });
  }

  await db.insert(pmsRatePlanPrices).values(ratePriceRows);
  console.log(`Rate Prices: ${ratePriceRows.length} created (4 plans × 5 room types)`);

  // ── Guests ────────────────────────────────────────────────────
  const guestDefs = [
    { first: 'Michael', last: 'Chen', email: 'mchen@outlook.com', phone: '404-555-1201', vip: false, stays: 0 },
    { first: 'Patricia', last: 'Morrison', email: 'pmorrison@gmail.com', phone: '212-555-3344', vip: true, stays: 4 },
    { first: 'David', last: 'Torres', email: 'dtorres@yahoo.com', phone: '305-555-2211', vip: false, stays: 1 },
    { first: 'Linda', last: 'Nakamura', email: 'lnakamura@icloud.com', phone: '415-555-7788', vip: false, stays: 0 },
    { first: 'James', last: 'Whitfield', email: 'jwhitfield@proton.me', phone: '770-555-4455', vip: false, stays: 2 },
    { first: 'Angela', last: 'Brooks', email: 'abrooks@gmail.com', phone: '910-555-9911', vip: true, stays: 7 },
    { first: 'Thomas', last: 'Kowalski', email: 'tkowalski@outlook.com', phone: '617-555-3322', vip: false, stays: 0 },
    { first: 'Sandra', last: 'Reeves', email: 'sreeves@hotmail.com', phone: '843-555-6677', vip: false, stays: 1 },
    { first: 'Robert', last: 'Patel', email: 'rpatel@gmail.com', phone: '678-555-8899', vip: false, stays: 0 },
    { first: 'Karen', last: 'Lindqvist', email: 'klindqvist@yahoo.com', phone: '919-555-2200', vip: false, stays: 3 },
    { first: 'William', last: 'O\'Donnell', email: 'wodonnell@gmail.com', phone: '508-555-1122', vip: false, stays: 0 },
    { first: 'Maria', last: 'Santos', email: 'msantos@outlook.com', phone: '786-555-5533', vip: false, stays: 1 },
    { first: 'Christopher', last: 'Huang', email: 'chuang@icloud.com', phone: '310-555-4466', vip: false, stays: 0 },
    { first: 'Barbara', last: 'Fitzgerald', email: 'bfitzgerald@gmail.com', phone: '704-555-7700', vip: true, stays: 5 },
    { first: 'Daniel', last: 'Nguyen', email: 'dnguyen@proton.me', phone: '469-555-8800', vip: false, stays: 0 },
    { first: 'Jennifer', last: 'Campbell', email: 'jcampbell@yahoo.com', phone: '252-555-3311', vip: false, stays: 2 },
    { first: 'Mark', last: 'Stefanovic', email: 'mstefanovic@outlook.com', phone: '813-555-9900', vip: false, stays: 0 },
    { first: 'Susan', last: 'Thornton', email: 'sthornton@gmail.com', phone: '336-555-4422', vip: false, stays: 1 },
    { first: 'Richard', last: 'Meyer', email: 'rmeyer@icloud.com', phone: '202-555-6611', vip: true, stays: 6 },
    { first: 'Lisa', last: 'Dubois', email: 'ldubois@gmail.com', phone: '504-555-1188', vip: false, stays: 0 },
    { first: 'Anthony', last: 'Russo', email: 'arusso@outlook.com', phone: '856-555-7744', vip: false, stays: 0 },
    { first: 'Elizabeth', last: 'Harper', email: 'eharper@yahoo.com', phone: '910-555-2255', vip: false, stays: 3 },
  ];

  // ── Hotel Guest system tag ─────────────────────────────────────
  await db.insert(tags).values({
    id: generateUlid(),
    tenantId,
    name: 'Hotel Guest',
    slug: 'hotel-guest',
    description: 'Automatically applied to customers created from PMS guest records',
    color: '#0EA5E9',
    icon: 'Hotel',
    tagType: 'manual',
    isSystem: true,
    displayOrder: 0,
    createdBy: 'system',
  });
  console.log('Tags:       Hotel Guest system tag created');

  const guestIds: string[] = [];
  await db.insert(pmsGuests).values(
    guestDefs.map((g) => {
      const gid = generateUlid();
      guestIds.push(gid);
      return {
        id: gid,
        tenantId,
        propertyId,
        firstName: g.first,
        lastName: g.last,
        email: g.email,
        phone: g.phone,
        isVip: g.vip,
        totalStays: g.stays,
        lastStayDate: g.stays > 0 ? '2025-12-15' : null,
        preferencesJson: {},
      };
    }),
  );
  console.log(`Guests:     ${guestDefs.length} created (4 VIP)`);

  // ── Reservations (20) ─────────────────────────────────────────
  // Mix of statuses: 3 checked-in (in-house), 15 confirmed upcoming, 2 checked-out recent
  // Spread across next 2 weeks with realistic patterns
  type ResDef = {
    guestIdx: number;
    roomNumber: string;
    roomTypeId: string;
    ratePlanId: string;
    checkInOffset: number;
    nights: number;
    adults: number;
    children: number;
    status: string;
    source: string;
    nightlyRateCents: number;
    notes?: string;
  };

  const resDefs: ResDef[] = [
    // ── Currently checked-in (arrived yesterday or today) ──
    { guestIdx: 1, roomNumber: '303', roomTypeId: roomTypeIds.deluxeKing, ratePlanId: ratePlanIds.rack, checkInOffset: -1, nights: 5, adults: 2, children: 0, status: 'CHECKED_IN', source: 'DIRECT', nightlyRateCents: 21900, notes: 'VIP — anniversary trip, comp champagne delivered' },
    { guestIdx: 5, roomNumber: '401', roomTypeId: roomTypeIds.oceanSuite, ratePlanId: ratePlanIds.rack, checkInOffset: -2, nights: 7, adults: 2, children: 0, status: 'CHECKED_IN', source: 'DIRECT', nightlyRateCents: 32900, notes: 'VIP repeat guest — prefers high floor, ocean view' },
    { guestIdx: 2, roomNumber: '101', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.winter, checkInOffset: 0, nights: 3, adults: 2, children: 1, status: 'CHECKED_IN', source: 'OTA', nightlyRateCents: 13500 },

    // ── Recently checked-out (last 2 days) ──
    { guestIdx: 7, roomNumber: '201', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.aaa, checkInOffset: -4, nights: 2, adults: 1, children: 0, status: 'CHECKED_OUT', source: 'DIRECT', nightlyRateCents: 14300 },
    { guestIdx: 11, roomNumber: '205', roomTypeId: roomTypeIds.deluxeKing, ratePlanId: ratePlanIds.rack, checkInOffset: -3, nights: 2, adults: 2, children: 0, status: 'CHECKED_OUT', source: 'OTA', nightlyRateCents: 21900 },

    // ── Arriving tomorrow ──
    { guestIdx: 0, roomNumber: '102', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.golf, checkInOffset: 1, nights: 3, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 20900, notes: 'Golf package — tee time 8:30 AM requested' },
    { guestIdx: 3, roomNumber: '301', roomTypeId: roomTypeIds.deluxeKing, ratePlanId: ratePlanIds.rack, checkInOffset: 1, nights: 2, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 21900 },

    // ── Arriving in 2–3 days ──
    { guestIdx: 4, roomNumber: '210', roomTypeId: roomTypeIds.familySuite, ratePlanId: ratePlanIds.rack, checkInOffset: 2, nights: 4, adults: 2, children: 2, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 28900, notes: 'Family with young kids — need crib in room' },
    { guestIdx: 6, roomNumber: '103', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.winter, checkInOffset: 2, nights: 2, adults: 1, children: 0, status: 'CONFIRMED', source: 'OTA', nightlyRateCents: 13500 },
    { guestIdx: 8, roomNumber: '302', roomTypeId: roomTypeIds.deluxeKing, ratePlanId: ratePlanIds.aaa, checkInOffset: 3, nights: 3, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 19700 },

    // ── Arriving in 4–6 days ──
    { guestIdx: 9, roomNumber: '304', roomTypeId: roomTypeIds.oceanSuite, ratePlanId: ratePlanIds.rack, checkInOffset: 4, nights: 5, adults: 2, children: 1, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 32900, notes: 'Returning guest — always requests extra pillows' },
    { guestIdx: 10, roomNumber: '104', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.golf, checkInOffset: 5, nights: 3, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 20900 },
    { guestIdx: 12, roomNumber: '206', roomTypeId: roomTypeIds.deluxeKing, ratePlanId: ratePlanIds.rack, checkInOffset: 5, nights: 2, adults: 2, children: 0, status: 'CONFIRMED', source: 'OTA', nightlyRateCents: 21900 },
    { guestIdx: 13, roomNumber: '501', roomTypeId: roomTypeIds.penthouse, ratePlanId: ratePlanIds.rack, checkInOffset: 6, nights: 4, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 59900, notes: 'VIP — birthday celebration, arrange cake & flowers' },

    // ── Arriving in 7–10 days ──
    { guestIdx: 14, roomNumber: '211', roomTypeId: roomTypeIds.familySuite, ratePlanId: ratePlanIds.winter, checkInOffset: 7, nights: 5, adults: 2, children: 3, status: 'CONFIRMED', source: 'OTA', nightlyRateCents: 24500 },
    { guestIdx: 15, roomNumber: '402', roomTypeId: roomTypeIds.oceanSuite, ratePlanId: ratePlanIds.rack, checkInOffset: 8, nights: 3, adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 32900 },
    { guestIdx: 16, roomNumber: '202', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.aaa, checkInOffset: 9, nights: 2, adults: 1, children: 0, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 14300 },

    // ── Arriving in 11–14 days ──
    { guestIdx: 17, roomNumber: '203', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.rack, checkInOffset: 11, nights: 4, adults: 2, children: 0, status: 'CONFIRMED', source: 'OTA', nightlyRateCents: 15900 },
    { guestIdx: 18, roomNumber: '310', roomTypeId: roomTypeIds.familySuite, ratePlanId: ratePlanIds.golf, checkInOffset: 12, nights: 3, adults: 2, children: 1, status: 'CONFIRMED', source: 'DIRECT', nightlyRateCents: 33900, notes: 'VIP — repeat guest requesting pool-view family suite' },
    { guestIdx: 19, roomNumber: '204', roomTypeId: roomTypeIds.standard, ratePlanId: ratePlanIds.winter, checkInOffset: 13, nights: 2, adults: 2, children: 0, status: 'CONFIRMED', source: 'OTA', nightlyRateCents: 13500 },
  ];

  const resIds: string[] = [];
  const resInserts = resDefs.map((r, idx) => {
    const resId = generateUlid();
    resIds.push(resId);
    const g = guestDefs[r.guestIdx]!;
    const subtotal = r.nightlyRateCents * r.nights;
    const tax = Math.round(subtotal * 0.12);
    const total = subtotal + tax;
    const confNum = `SBG-${(20260200 + idx + 1).toString()}`;

    return {
      id: resId,
      tenantId,
      propertyId,
      guestId: guestIds[r.guestIdx]!,
      primaryGuestJson: { firstName: g.first, lastName: g.last, email: g.email, phone: g.phone },
      roomTypeId: r.roomTypeId,
      roomId: roomMap[r.roomNumber]!,
      ratePlanId: r.ratePlanId,
      checkInDate: dateStr(r.checkInOffset),
      checkOutDate: dateStr(r.checkInOffset + r.nights),
      status: r.status,
      sourceType: r.source,
      adults: r.adults,
      children: r.children,
      nights: r.nights,
      nightlyRateCents: r.nightlyRateCents,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      confirmationNumber: confNum,
      internalNotes: r.notes ?? null,
      checkedInAt: r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT'
        ? new Date(new Date(dateStr(r.checkInOffset)).getTime() + 15 * 3600000)
        : null,
      checkedInBy: r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT' ? userId : null,
      checkedOutAt: r.status === 'CHECKED_OUT'
        ? new Date(new Date(dateStr(r.checkInOffset + r.nights)).getTime() + 11 * 3600000)
        : null,
      checkedOutBy: r.status === 'CHECKED_OUT' ? userId : null,
      createdBy: userId,
    };
  });

  await db.insert(pmsReservations).values(resInserts);
  console.log(`Reservations: ${resDefs.length} created (3 checked-in, 2 checked-out, 15 confirmed)`);

  // ── Update room status for checked-in rooms ───────────────────
  // Rooms with active guests should show as OCCUPIED
  const checkedInRoomNumbers = resDefs
    .filter((r) => r.status === 'CHECKED_IN')
    .map((r) => r.roomNumber);

  for (const rn of checkedInRoomNumbers) {
    const rid = roomMap[rn]!;
    await client`UPDATE pms_rooms SET status = 'OCCUPIED' WHERE id = ${rid}`;
  }

  // Rooms that just checked out are DIRTY
  const checkedOutRoomNumbers = resDefs
    .filter((r) => r.status === 'CHECKED_OUT')
    .map((r) => r.roomNumber);

  for (const rn of checkedOutRoomNumbers) {
    const rid = roomMap[rn]!;
    await client`UPDATE pms_rooms SET status = 'DIRTY' WHERE id = ${rid}`;
  }
  console.log(`Room Status: ${checkedInRoomNumbers.length} OCCUPIED, ${checkedOutRoomNumbers.length} DIRTY, rest VACANT_CLEAN`);

  // ── Folios (for checked-in + checked-out reservations) ────────
  const folioReservations = resDefs
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT');

  const folioIds: string[] = [];

  for (const res of folioReservations) {
    const folioId = generateUlid();
    folioIds.push(folioId);

    const nightsCharged = res.status === 'CHECKED_OUT'
      ? res.nights
      : Math.max(1, -res.checkInOffset); // nights elapsed so far for in-house
    const roomChargeTotal = res.nightlyRateCents * nightsCharged;
    const roomTax = Math.round(roomChargeTotal * 0.12);

    // Add some incidental charges for realism
    const incidentals = res.status === 'CHECKED_IN'
      ? [
          { type: 'CHARGE', desc: 'Room Service — Breakfast', cents: 2450 },
          { type: 'CHARGE', desc: 'Sunset Bar & Grill — Dinner', cents: 8700 },
          { type: 'CHARGE', desc: 'Spa Treatment — Deep Tissue Massage', cents: 15000 },
        ].slice(0, res.idx % 3 + 1) // 1-3 incidentals per guest
      : [
          { type: 'CHARGE', desc: 'Mini Bar', cents: 3200 },
          { type: 'CHARGE', desc: 'Sunset Bar & Grill — Lunch', cents: 4500 },
        ];

    const incidentalTotal = incidentals.reduce((sum, i) => sum + i.cents, 0);
    const incidentalTax = Math.round(incidentalTotal * 0.12);

    const subtotal = roomChargeTotal + incidentalTotal;
    const totalTax = roomTax + incidentalTax;
    const total = subtotal + totalTax;
    const paymentsMade = res.status === 'CHECKED_OUT' ? total : 0;
    const balance = total - paymentsMade;

    await db.insert(pmsFolios).values({
      id: folioId,
      tenantId,
      propertyId,
      reservationId: resIds[res.idx]!,
      guestId: guestIds[res.guestIdx]!,
      status: res.status === 'CHECKED_OUT' ? 'CLOSED' : 'OPEN',
      subtotalCents: subtotal,
      taxCents: totalTax,
      totalCents: total,
      paymentCents: paymentsMade,
      balanceCents: balance,
      closedAt: res.status === 'CHECKED_OUT' ? new Date() : null,
      closedBy: res.status === 'CHECKED_OUT' ? userId : null,
      createdBy: userId,
    });

    // Folio entries — room charges per night
    const entryRows: Array<{
      tenantId: string;
      folioId: string;
      entryType: string;
      description: string;
      amountCents: number;
      businessDate: string;
    }> = [];

    for (let n = 0; n < nightsCharged; n++) {
      entryRows.push({
        tenantId,
        folioId,
        entryType: 'ROOM_CHARGE',
        description: `Room ${res.roomNumber} — Night ${n + 1}`,
        amountCents: res.nightlyRateCents,
        businessDate: dateStr(res.checkInOffset + n),
      });
      entryRows.push({
        tenantId,
        folioId,
        entryType: 'TAX',
        description: `Room Tax — Night ${n + 1}`,
        amountCents: Math.round(res.nightlyRateCents * 0.12),
        businessDate: dateStr(res.checkInOffset + n),
      });
    }

    // Incidentals
    for (const inc of incidentals) {
      entryRows.push({
        tenantId,
        folioId,
        entryType: inc.type,
        description: inc.desc,
        amountCents: inc.cents,
        businessDate: dateStr(res.checkInOffset + Math.min(1, nightsCharged - 1)),
      });
    }

    // Payment entry for checked-out guests
    if (res.status === 'CHECKED_OUT') {
      entryRows.push({
        tenantId,
        folioId,
        entryType: 'PAYMENT',
        description: 'Credit Card Payment — Visa ****4242',
        amountCents: -total,
        businessDate: dateStr(res.checkInOffset + res.nights),
      });
    }

    if (entryRows.length > 0) {
      await db.insert(pmsFolioEntries).values(entryRows);
    }
  }
  console.log(`Folios:     ${folioIds.length} created with charges + entries`);

  // ── Default KDS Stations (F&B) ────────────────────────────────
  const kdsStationIds = [generateUlid(), generateUlid()];
  await db.insert(fnbKitchenStations).values([
    {
      id: kdsStationIds[0]!,
      tenantId,
      locationId: locationIds[0]!,
      name: 'kitchen_main',
      displayName: 'Main Kitchen',
      stationType: 'prep',
      color: '#ef4444',
      sortOrder: 1,
      isActive: true,
      warningThresholdSeconds: 300,
      criticalThresholdSeconds: 600,
    },
    {
      id: kdsStationIds[1]!,
      tenantId,
      locationId: locationIds[0]!,
      name: 'bar_main',
      displayName: 'Bar',
      stationType: 'bar',
      color: '#3b82f6',
      sortOrder: 2,
      isActive: true,
      warningThresholdSeconds: 180,
      criticalThresholdSeconds: 420,
    },
  ]);
  console.log(`KDS Stations: 2 created (Main Kitchen + Bar) for venue ${locationIds[0]}`);

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n=== Seed Summary ===');
  console.log(`Tenant ID:      ${tenantId}`);
  console.log(`Location IDs:   ${locationIds.join(', ')}`);
  console.log(`User ID:        ${userId}`);
  console.log(`Roles:          ${Object.keys(roleIds).length}`);
  console.log(`Entitlements:   ${moduleKeys.length}`);
  console.log('Catalog:        4 tax cats, 5 cats, 10 items, 3 mod groups, 3 price overrides');
  console.log('Tax System:     3 rates, 6 groups, 11 group-rate links, 13 item assignments');
  console.log('Inventory:      6 items (3 trackable × 2 locations)');
  console.log('Customers:      4 customers, 3 identifiers, 3 contacts, 3 preferences');
  console.log('Memberships:    2 plans, 2 enrollments');
  console.log('Billing:        2 house accounts, 2 members');
  console.log('Locations:      1 site, 2 venues (Main Clubhouse, South Course Pro Shop)');
  console.log('Terminals:      2 profit centers, 2 terminals (1 per venue)');
  console.log('Payments:       1 provider (CardPointe), 1 MID (496160873888 UAT)');
  console.log('KDS Stations:   2 (Main Kitchen prep, Bar)');
  console.log('── Sales ──');
  console.log(`Orders:         ${allOrderInserts.length} (14 days of history, mix of paid + voided)`);
  console.log(`Order Lines:    ${allLineInserts.length}`);
  console.log(`Tenders:        ${allTenderInserts.length} (cash + card)`);
  console.log(`Daily Sales RM: ${dailySalesRows.length} rows`);
  console.log(`Item Sales RM:  ${itemSalesRows.length} rows`);
  console.log('── PMS ──');
  console.log(`Property:       Sunset Bar & Grill Resort`);
  console.log(`Room Types:     5 (STD $159, DLX $219, OCS $329, FAM $289, PH $599)`);
  console.log(`Rooms:          20 (8 STD, 5 DLX, 3 OCS, 3 FAM, 1 PH)`);
  console.log(`Rate Plans:     4 (Rack, Winter Escape, AAA, Golf Getaway)`);
  console.log(`Guests:         ${guestDefs.length} profiles (4 VIP)`);
  console.log(`Reservations:   ${resDefs.length} (3 in-house, 2 checked-out, 15 upcoming)`);
  console.log(`Folios:         ${folioIds.length} with room charges + incidentals`);
  console.log('====================\n');

  await client.end();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
