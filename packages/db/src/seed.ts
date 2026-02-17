import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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
} from './schema';

async function seed() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log('Seeding database...\n');

  // ── Create tenant ──────────────────────────────────────────────
  const tenantId = generateUlid();
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Sunset Golf & Grill',
    slug: 'sunset-golf',
    status: 'active',
  });
  console.log(`Tenant: ${tenantId} (Sunset Golf & Grill)`);

  // ── Create locations ───────────────────────────────────────────
  const locationIds = [generateUlid(), generateUlid()];

  await db.insert(locations).values([
    {
      id: locationIds[0],
      tenantId,
      name: 'Main Clubhouse',
      timezone: 'America/New_York',
      addressLine1: '100 Fairway Dr',
      city: 'Sunset Beach',
      state: 'NC',
      postalCode: '28468',
      country: 'US',
    },
    {
      id: locationIds[1],
      tenantId,
      name: 'South Course Pro Shop',
      timezone: 'America/New_York',
      addressLine1: '200 Links Rd',
      city: 'Sunset Beach',
      state: 'NC',
      postalCode: '28468',
      country: 'US',
    },
  ]);
  console.log(`Location 1: ${locationIds[0]} (Main Clubhouse)`);
  console.log(`Location 2: ${locationIds[1]} (South Course Pro Shop)`);

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
      description: 'Administrative access to all business modules',
      permissions: [
        'catalog.*',
        'orders.*',
        'inventory.*',
        'customers.*',
        'reports.*',
        'settings.*',
        'users.*',
      ],
    },
    {
      name: 'manager',
      description: 'Manage daily operations',
      permissions: [
        'catalog.*',
        'orders.*',
        'inventory.*',
        'customers.*',
        'reports.view',
        'settings.view',
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

  // ── Create V1 entitlements ─────────────────────────────────────
  const moduleKeys = [
    'platform_core',
    'catalog',
    'pos_retail',
    'payments',
    'inventory',
    'customers',
    'reporting',
  ];

  const entitlementLimits = { max_seats: 25, max_locations: 10, max_devices: 10 };

  await db.insert(entitlements).values(
    moduleKeys.map((moduleKey) => ({
      tenantId,
      moduleKey,
      planTier: 'standard',
      isEnabled: true,
      limits: entitlementLimits,
    })),
  );
  console.log(`Entitlements: ${moduleKeys.length} modules enabled`);

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
    {
      tenantId,
      catalogItemId: itemIds.greenFee18,
      locationId: locationIds[1]!,
      price: '65.00',
    },
    {
      tenantId,
      catalogItemId: itemIds.greenFee9,
      locationId: locationIds[1]!,
      price: '40.00',
    },
    {
      tenantId,
      catalogItemId: itemIds.beer,
      locationId: locationIds[1]!,
      price: '6.99',
    },
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

  // Main Clubhouse groups
  await db.insert(taxGroups).values([
    { id: tgIds.mainRetail, tenantId, locationId: locationIds[0]!, name: 'Retail Tax', calculationMode: 'exclusive', createdBy: userId },
    { id: tgIds.mainFood, tenantId, locationId: locationIds[0]!, name: 'Food & Bev Tax', calculationMode: 'exclusive', createdBy: userId },
    { id: tgIds.mainAlcohol, tenantId, locationId: locationIds[0]!, name: 'Alcohol Tax', calculationMode: 'exclusive', createdBy: userId },
    { id: tgIds.mainExempt, tenantId, locationId: locationIds[0]!, name: 'Tax Exempt', calculationMode: 'exclusive', createdBy: userId },
  ]);

  // South Course groups
  await db.insert(taxGroups).values([
    { id: tgIds.southRetail, tenantId, locationId: locationIds[1]!, name: 'Retail Tax', calculationMode: 'exclusive', createdBy: userId },
    { id: tgIds.southFood, tenantId, locationId: locationIds[1]!, name: 'Food & Bev Tax', calculationMode: 'exclusive', createdBy: userId },
  ]);
  console.log('Tax Groups: 6 created (4 Main Clubhouse, 2 South Course)');

  // ── Tax Group Rates (link rates to groups) ────────────────────
  await db.insert(taxGroupRates).values([
    // Main Retail: MI State 6% + Genesee County 1.5%
    { tenantId, taxGroupId: tgIds.mainRetail, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainRetail, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    // Main Food: MI State 6% + Genesee County 1.5% + City Restaurant 0.75%
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    { tenantId, taxGroupId: tgIds.mainFood, taxRateId: rateIds.cityRestaurant, sortOrder: 2 },
    // Main Alcohol: MI State 6% + Genesee County 1.5% + City Restaurant 0.75%
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.geneseeCounty, sortOrder: 1 },
    { tenantId, taxGroupId: tgIds.mainAlcohol, taxRateId: rateIds.cityRestaurant, sortOrder: 2 },
    // Main Exempt: no rates (empty group)
    // South Retail: MI State 6%
    { tenantId, taxGroupId: tgIds.southRetail, taxRateId: rateIds.miState, sortOrder: 0 },
    // South Food: MI State 6% + City Restaurant 0.75%
    { tenantId, taxGroupId: tgIds.southFood, taxRateId: rateIds.miState, sortOrder: 0 },
    { tenantId, taxGroupId: tgIds.southFood, taxRateId: rateIds.cityRestaurant, sortOrder: 1 },
  ]);
  console.log('Tax Group Rates: 11 associations created');

  // ── Item Tax Group Assignments (per location) ─────────────────
  await db.insert(catalogItemLocationTaxGroups).values([
    // Main Clubhouse assignments
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
    // South Course assignments
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.polo, taxGroupId: tgIds.southRetail },
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.gloves, taxGroupId: tgIds.southRetail },
    { tenantId, locationId: locationIds[1]!, catalogItemId: itemIds.beer, taxGroupId: tgIds.southFood },
  ]);
  console.log('Item Tax Group Assignments: 13 created (10 Main, 3 South)');

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n=== Seed Summary ===');
  console.log(`Tenant ID:      ${tenantId}`);
  console.log(`Location IDs:   ${locationIds.join(', ')}`);
  console.log(`User ID:        ${userId}`);
  console.log(`Roles:          ${Object.keys(roleIds).length}`);
  console.log(`Entitlements:   ${moduleKeys.length}`);
  console.log('Catalog:        4 tax cats, 5 cats, 10 items, 3 mod groups, 3 price overrides');
  console.log('Tax System:     3 rates, 6 groups, 11 group-rate links, 13 item assignments');
  console.log('====================\n');

  await client.end();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
