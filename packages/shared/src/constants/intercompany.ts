/**
 * Intercompany elimination constants
 * Schema-only in V1 — no elimination engine
 */

// GL account templates for intercompany transactions
export const INTERCOMPANY_ACCOUNT_TEMPLATES = {
  INTERCOMPANY_RECEIVABLE: {
    accountNumber: '1300',
    name: 'Intercompany Receivable',
    accountType: 'asset' as const,
    normalBalance: 'debit' as const,
    description: 'Amounts due from related legal entities',
  },
  INTERCOMPANY_PAYABLE: {
    accountNumber: '2900',
    name: 'Intercompany Payable',
    accountType: 'liability' as const,
    normalBalance: 'credit' as const,
    description: 'Amounts owed to related legal entities',
  },
  INTERCOMPANY_REVENUE_ELIMINATION: {
    accountNumber: '4900',
    name: 'Intercompany Revenue (Elimination)',
    accountType: 'revenue' as const,
    normalBalance: 'credit' as const,
    description: 'Intercompany revenue eliminated during consolidation',
  },
  INTERCOMPANY_EXPENSE_ELIMINATION: {
    accountNumber: '5900',
    name: 'Intercompany Expense (Elimination)',
    accountType: 'expense' as const,
    normalBalance: 'debit' as const,
    description: 'Intercompany expense eliminated during consolidation',
  },
} as const;

/** Consolidation methods for financial reporting */
export type ConsolidationMethod = 'full' | 'equity' | 'proportional';

/** All supported consolidation methods with descriptions */
export const CONSOLIDATION_METHODS: Record<
  ConsolidationMethod,
  { label: string; description: string }
> = {
  full: {
    label: 'Full Consolidation',
    description:
      'Combine 100% of subsidiary financials, eliminate intercompany transactions. Used for wholly-owned subsidiaries.',
  },
  equity: {
    label: 'Equity Method',
    description:
      'Record investment at cost plus share of net income. Used for significant influence (20-50% ownership).',
  },
  proportional: {
    label: 'Proportional Consolidation',
    description:
      'Combine proportional share of assets, liabilities, revenue, and expenses. Used for joint ventures.',
  },
};

/** Entity relationship types for intercompany accounting */
export type EntityRelationshipType = 'parent_subsidiary' | 'sister_companies' | 'joint_venture';

export const ENTITY_RELATIONSHIP_TYPES: Record<
  EntityRelationshipType,
  { label: string; defaultConsolidationMethod: ConsolidationMethod }
> = {
  parent_subsidiary: {
    label: 'Parent / Subsidiary',
    defaultConsolidationMethod: 'full',
  },
  sister_companies: {
    label: 'Sister Companies',
    defaultConsolidationMethod: 'full',
  },
  joint_venture: {
    label: 'Joint Venture',
    defaultConsolidationMethod: 'proportional',
  },
};
