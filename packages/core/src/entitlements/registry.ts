export const MODULE_REGISTRY = [
  { key: 'platform_core', name: 'Platform Core', phase: 'v1', description: 'Identity, auth, RBAC, audit logging' },
  { key: 'catalog', name: 'Product Catalog', phase: 'v1', description: 'Items, categories, modifiers, pricing, tax categories' },
  { key: 'pos_retail', name: 'Retail POS', phase: 'v1', description: 'Orders, line items, discounts, tax calculation' },
  { key: 'pos_restaurant', name: 'Restaurant POS', phase: 'v1', description: 'Tables, seats, coursing, kitchen tickets' },
  { key: 'payments', name: 'Payments & Tenders', phase: 'v1', description: 'Cash (V1), card, split, refund (V2)' },
  { key: 'inventory', name: 'Inventory Management', phase: 'v1', description: 'Stock movements, receiving, adjustments, transfers' },
  { key: 'customers', name: 'Customer Management', phase: 'v1', description: 'Profiles, search, visit/spend tracking' },
  { key: 'marketing', name: 'Marketing Automation', phase: 'v2', description: 'Segments, campaigns, triggered journeys' },
  { key: 'kds', name: 'Kitchen Display', phase: 'v2', description: 'Kitchen order tickets, bump screen' },
  { key: 'golf_ops', name: 'Golf Operations', phase: 'v1', description: 'Tee sheet, starter sheet, pace-of-play' },
  { key: 'reporting', name: 'Reports & Exports', phase: 'v1', description: 'Read models, daily sales, CSV/PDF export' },
  { key: 'room_layouts', name: 'Room Layouts', phase: 'v1', description: 'Floor plan editor, templates, version management' },
  { key: 'accounting', name: 'Accounting & GL', phase: 'v1', description: 'General ledger, chart of accounts, journal entries, period close' },
  { key: 'accounts_payable', name: 'Accounts Payable', phase: 'v1', description: 'AP invoices, vendor payments, landed cost' },
  { key: 'accounts_receivable', name: 'Accounts Receivable', phase: 'v1', description: 'AR invoices, customer payments, aging, statements' },
  { key: 'api_access', name: 'API Access', phase: 'v3', description: 'Public API with OAuth2 client credentials' },
  { key: 'semantic', name: 'AI Insights (Semantic Layer)', phase: 'v1', description: 'Natural-language analytics, query compiler, LLM pipeline, custom lenses' },
] as const;

export type ModuleKey = (typeof MODULE_REGISTRY)[number]['key'];
