import type { InferSelectModel } from 'drizzle-orm';
import type {
  taxCategories,
  catalogCategories,
  catalogItems,
  catalogModifierGroups,
  catalogModifiers,
  catalogLocationPrices,
} from './schema';

export type TaxCategory = InferSelectModel<typeof taxCategories>;
export type CatalogCategory = InferSelectModel<typeof catalogCategories>;
export type CatalogItem = InferSelectModel<typeof catalogItems>;
export type ModifierGroup = InferSelectModel<typeof catalogModifierGroups>;
export type Modifier = InferSelectModel<typeof catalogModifiers>;
export type LocationPrice = InferSelectModel<typeof catalogLocationPrices>;

export interface ModifierGroupWithModifiers extends ModifierGroup {
  modifiers: Modifier[];
}

export interface CatalogItemWithModifiers extends CatalogItem {
  modifierGroups: ModifierGroupWithModifiers[];
}
