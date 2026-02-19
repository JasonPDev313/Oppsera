// Catalog schema is defined in packages/db/src/schema/catalog.ts
// and packages/db/src/schema/catalog-taxes.ts
// so drizzle-kit can discover them for migrations.
// Re-exported here for module-local imports.
export {
  taxCategories,
  catalogCategories,
  catalogItems,
  catalogModifierGroups,
  catalogModifiers,
  catalogItemModifierGroups,
  catalogLocationPrices,
  catalogItemChangeLogs,
  taxRates,
  taxGroups,
  taxGroupRates,
  catalogItemLocationTaxGroups,
  orderLineTaxes,
} from '@oppsera/db';
