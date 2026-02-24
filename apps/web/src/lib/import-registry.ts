import {
  Users,
  UserPlus,
  ShoppingBag,
  Receipt,
  BookOpen,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface ImportTypeConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  acceptedFormats: string[];
  category: 'people' | 'products' | 'financial';
  href: string;
  /** Module key that must be enabled for this import type to appear */
  requiresEntitlement?: string;
  /** Microcopy displayed during upload phase */
  uploadTip?: string;
  /** Microcopy displayed while analyzing / mapping */
  analysisTip?: string;
  /** Estimated time range for common file sizes */
  estimateLabel?: string;
  /** Sort order within category (lower = first) */
  sortOrder?: number;
}

// ── Registry ──────────────────────────────────────────────────────

export const IMPORT_TYPES: ImportTypeConfig[] = [
  // People
  {
    key: 'customers',
    label: 'Customers',
    icon: Users,
    description: 'Import customer records from a CSV. AI will map your columns automatically.',
    acceptedFormats: ['CSV'],
    category: 'people',
    href: '/customers?import=true',
    requiresEntitlement: 'customers',
    uploadTip: 'Export your customer list from your current system as a CSV. Include name, email, and phone columns for best results.',
    analysisTip: 'We look for name, email, phone, and address columns. Customer IDs from your old system are preserved as external references.',
    estimateLabel: 'Usually under 30 seconds',
    sortOrder: 1,
  },
  {
    key: 'staff',
    label: 'Staff & Employees',
    icon: UserPlus,
    description: 'Import staff directory, roles, and contact information.',
    acceptedFormats: ['CSV', 'TSV'],
    category: 'people',
    href: '/settings/import/staff',
    uploadTip: 'Include at minimum a name and email column. Role and location columns are auto-matched if present.',
    analysisTip: 'We match roles by name similarity — "Manager" in your file maps to the Manager role in OppsEra automatically.',
    estimateLabel: 'Usually under 10 seconds',
    sortOrder: 2,
  },

  // Products
  {
    key: 'catalog',
    label: 'Inventory Items',
    icon: ShoppingBag,
    description: 'Import products, pricing, SKUs, and category assignments.',
    acceptedFormats: ['CSV'],
    category: 'products',
    href: '/catalog?import=true',
    requiresEntitlement: 'catalog',
    uploadTip: 'Export your item list with SKU, name, price, and department/category columns. Barcodes are auto-detected.',
    analysisTip: 'We auto-detect price format (dollars vs cents), map departments to your catalog hierarchy, and flag duplicate SKUs.',
    estimateLabel: 'Usually under 1 minute',
    sortOrder: 1,
  },

  // Financial
  {
    key: 'transactions',
    label: 'Transactions',
    icon: Receipt,
    description: 'Import historical transaction data from another POS system.',
    acceptedFormats: ['CSV', 'TSV', 'TXT'],
    category: 'financial',
    href: '/settings/import/new',
    uploadTip: 'Export your transaction history from your old POS. Include transaction ID, date, item details, and payment info.',
    analysisTip: 'We reconstruct orders from flat rows, match payment types, and compute a reconciliation so totals match your legacy system.',
    estimateLabel: '1-5 minutes for large files',
    sortOrder: 1,
  },
  {
    key: 'coa',
    label: 'Chart of Accounts',
    icon: BookOpen,
    description: 'Import your existing chart of accounts from accounting software.',
    acceptedFormats: ['CSV'],
    category: 'financial',
    href: '/accounting/accounts?import=true',
    requiresEntitlement: 'accounting',
    uploadTip: 'Export your COA from QuickBooks, Xero, or Sage. Include account number, name, and type columns.',
    analysisTip: 'We match account types (Asset, Liability, Revenue, Expense) and build your GL hierarchy automatically.',
    estimateLabel: 'Usually under 10 seconds',
    sortOrder: 2,
  },
  {
    key: 'settlements',
    label: 'Card Settlements',
    icon: CreditCard,
    description: 'Import processor settlement files for reconciliation.',
    acceptedFormats: ['CSV'],
    category: 'financial',
    href: '/accounting/settlements?import=true',
    requiresEntitlement: 'accounting',
    uploadTip: 'Download your batch settlement report from your card processor portal.',
    analysisTip: 'We match settlement lines to existing tenders by date and amount for automatic reconciliation.',
    estimateLabel: 'Usually under 30 seconds',
    sortOrder: 3,
  },
];

// ── Category labels ───────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  people: 'People',
  products: 'Products',
  financial: 'Financial',
};

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Filter import types by enabled modules.
 * Types without a `requiresEntitlement` are always visible.
 */
export function getEnabledImportTypes(
  isModuleEnabled: (key: string) => boolean,
): ImportTypeConfig[] {
  return IMPORT_TYPES.filter(
    (t) => !t.requiresEntitlement || isModuleEnabled(t.requiresEntitlement),
  );
}

/**
 * Lookup map: importType key → display label.
 * Used by RecentImportsTable to render type names.
 */
export function getTypeLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const t of IMPORT_TYPES) {
    labels[t.key] = t.label;
  }
  // Also map the module keys used by the all-history API
  labels['accounting'] = 'Chart of Accounts';
  return labels;
}
