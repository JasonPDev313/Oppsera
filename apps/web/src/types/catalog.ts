// Re-export shared item type utilities
import type { ItemTypeGroup } from '@oppsera/shared';
export { getItemTypeGroup, ITEM_TYPE_MAP } from '@oppsera/shared';
export type { ItemTypeGroup } from '@oppsera/shared';

// Re-export metadata types from shared (canonical source)
export type {
  FnbMetadata,
  RetailMetadata,
  ServiceMetadata,
  PackageMetadata,
  CatalogItemMetadata,
} from '@oppsera/shared';

// Badge config
export const ITEM_TYPE_BADGES: Record<
  ItemTypeGroup,
  { label: string; variant: string }
> = {
  fnb: { label: 'F&B', variant: 'warning' },
  retail: { label: 'Retail', variant: 'indigo' },
  service: { label: 'Service', variant: 'purple' },
  package: { label: 'Package', variant: 'success' },
};

// Hierarchy types
export interface Department {
  id: string;
  name: string;
  isActive: boolean;
  subDepartmentCount?: number;
}

export interface SubDepartment {
  id: string;
  name: string;
  parentId: string;
  isActive: boolean;
  categoryCount?: number;
}

export interface Category {
  id: string;
  name: string;
  parentId: string;
  isActive: boolean;
  itemCount?: number;
}

// API response types
export interface CatalogItemRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  itemType: string;
  defaultPrice: string;
  cost: string | null;
  categoryId: string | null;
  taxCategoryId: string | null;
  priceIncludesTax: boolean;
  isTrackable: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string } | null;
  departmentName?: string | null;
  subDepartmentName?: string | null;
  categoryName?: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archivedReason?: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  color?: string | null;
  isActive: boolean;
  itemCount?: number;
}

export interface ModifierGroupRow {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers?: Array<{
    id: string;
    name: string;
    priceAdjustment: string;
    sortOrder: number;
    isActive: boolean;
  }>;
}

export interface TaxRateRow {
  id: string;
  name: string;
  rateDecimal: string;
  isActive: boolean;
  jurisdictionCode: string | null;
  authorityName: string | null;
  authorityType: string | null;
  taxType: string;
  filingFrequency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxGroupRow {
  id: string;
  name: string;
  locationId: string;
  isActive: boolean;
  rates: Array<{ id: string; name: string; rateDecimal: number }>;
  totalRate: number;
}
