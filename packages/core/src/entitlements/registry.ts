export type AccessMode = 'off' | 'view' | 'full';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ModuleCategory = 'core' | 'commerce' | 'operations' | 'finance' | 'analytics' | 'integrations';

export interface ModuleDefinition {
  key: string;
  name: string;
  phase: 'v1' | 'v2' | 'v3';
  description: string;
  /** Modules that MUST be enabled (view or full) before this one can be activated */
  dependencies: string[];
  /** Risk level for mode changes — 'high'/'critical' require a reason */
  riskLevel: RiskLevel;
  /** Whether this module supports VIEW mode (some are all-or-nothing) */
  supportsViewMode: boolean;
  /** Category for grouping in the admin UI */
  category: ModuleCategory;
}

export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    key: 'platform_core',
    name: 'Platform Core',
    phase: 'v1',
    description: 'Identity, auth, RBAC, audit logging',
    dependencies: [],
    riskLevel: 'critical',
    supportsViewMode: false,
    category: 'core',
  },
  {
    key: 'catalog',
    name: 'Product Catalog',
    phase: 'v1',
    description: 'Items, categories, modifiers, pricing, tax categories',
    dependencies: ['platform_core'],
    riskLevel: 'medium',
    supportsViewMode: true,
    category: 'commerce',
  },
  {
    key: 'pos_retail',
    name: 'Retail POS',
    phase: 'v1',
    description: 'Orders, line items, discounts, tax calculation',
    dependencies: ['catalog', 'payments'],
    riskLevel: 'high',
    supportsViewMode: true,
    category: 'commerce',
  },
  {
    key: 'pos_fnb',
    name: 'F&B POS',
    phase: 'v1',
    description: 'Tables, tabs, coursing, kitchen tickets, server management',
    dependencies: ['catalog', 'payments', 'room_layouts'],
    riskLevel: 'high',
    supportsViewMode: true,
    category: 'commerce',
  },
  {
    key: 'payments',
    name: 'Payments & Tenders',
    phase: 'v1',
    description: 'Cash (V1), card, split, refund (V2)',
    dependencies: ['catalog'],
    riskLevel: 'critical',
    supportsViewMode: false,
    category: 'commerce',
  },
  {
    key: 'inventory',
    name: 'Inventory Management',
    phase: 'v1',
    description: 'Stock movements, receiving, adjustments, transfers',
    dependencies: ['catalog'],
    riskLevel: 'medium',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'customers',
    name: 'Customer Management',
    phase: 'v1',
    description: 'Profiles, search, visit/spend tracking',
    dependencies: ['platform_core'],
    riskLevel: 'medium',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'marketing',
    name: 'Marketing Automation',
    phase: 'v2',
    description: 'Segments, campaigns, triggered journeys',
    dependencies: ['customers'],
    riskLevel: 'low',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'kds',
    name: 'Kitchen Display',
    phase: 'v2',
    description: 'Kitchen order tickets, bump screen',
    dependencies: ['pos_fnb'],
    riskLevel: 'low',
    supportsViewMode: false,
    category: 'operations',
  },
  {
    key: 'golf_ops',
    name: 'Golf Operations',
    phase: 'v1',
    description: 'Tee sheet, starter sheet, pace-of-play',
    dependencies: ['catalog'],
    riskLevel: 'medium',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'reporting',
    name: 'Reports & Exports',
    phase: 'v1',
    description: 'Read models, daily sales, CSV/PDF export',
    dependencies: ['platform_core'],
    riskLevel: 'low',
    supportsViewMode: true,
    category: 'analytics',
  },
  {
    key: 'room_layouts',
    name: 'Room Layouts',
    phase: 'v1',
    description: 'Floor plan editor, templates, version management',
    dependencies: ['platform_core'],
    riskLevel: 'low',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'accounting',
    name: 'Accounting & GL',
    phase: 'v1',
    description: 'General ledger, chart of accounts, journal entries, period close',
    dependencies: ['platform_core'],
    riskLevel: 'high',
    supportsViewMode: true,
    category: 'finance',
  },
  {
    key: 'ap',
    name: 'Accounts Payable',
    phase: 'v1',
    description: 'AP bills, vendor payments, payment terms, aging',
    dependencies: ['accounting'],
    riskLevel: 'high',
    supportsViewMode: true,
    category: 'finance',
  },
  {
    key: 'ar',
    name: 'Accounts Receivable',
    phase: 'v1',
    description: 'AR invoices, customer receipts, aging, statements',
    dependencies: ['accounting', 'customers'],
    riskLevel: 'high',
    supportsViewMode: true,
    category: 'finance',
  },
  {
    key: 'pms',
    name: 'Property Management',
    phase: 'v1',
    description: 'Reservations, calendar, front desk, housekeeping, folios, guest profiles',
    dependencies: ['platform_core', 'customers'],
    riskLevel: 'medium',
    supportsViewMode: true,
    category: 'operations',
  },
  {
    key: 'api_access',
    name: 'API Access',
    phase: 'v3',
    description: 'Public API with OAuth2 client credentials',
    dependencies: ['platform_core'],
    riskLevel: 'critical',
    supportsViewMode: false,
    category: 'integrations',
  },
  {
    key: 'semantic',
    name: 'AI Insights (Semantic Layer)',
    phase: 'v1',
    description: 'Natural-language analytics, query compiler, LLM pipeline, custom lenses',
    dependencies: ['reporting'],
    riskLevel: 'low',
    supportsViewMode: true,
    category: 'analytics',
  },
] as const;

export type ModuleKey = (typeof MODULE_REGISTRY)[number]['key'];

/** Look up a module definition by key */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/** Get all module keys that directly depend on the given module */
export function getDependents(moduleKey: string): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.dependencies.includes(moduleKey));
}
