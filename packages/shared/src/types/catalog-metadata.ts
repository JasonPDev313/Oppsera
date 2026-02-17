// Catalog item metadata interfaces — shared between frontend and backend.
// The item's `itemType` determines which metadata shape applies.

/** F&B items (food, beverage) */
export interface FnbMetadata {
  allowSpecialInstructions?: boolean;
  allowedFractions?: number[];
  defaultModifierGroupIds?: string[];
  optionalModifierGroupIds?: string[];
}

/** Retail items */
export interface RetailMetadata {
  optionSets?: Array<{
    name: string;
    options: string[];
    required: boolean;
  }>;
}

/** Service items */
export interface ServiceMetadata {
  durationMinutes?: number;
  requiresBooking?: boolean;
}

/** Package items (composed of other catalog items) */
export interface PackageMetadata {
  isPackage: true;
  packageComponents?: Array<{
    catalogItemId: string;
    itemName: string;
    itemType: string;
    qty: number;
  }>;
  pricingMode?: 'fixed' | 'sum_of_components';
}

/** Union of all metadata shapes */
export type CatalogItemMetadata = FnbMetadata | RetailMetadata | ServiceMetadata | PackageMetadata;
