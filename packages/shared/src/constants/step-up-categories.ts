/**
 * Step-up authentication categories.
 * Each category defines a TTL for the step-up token and a display label.
 *
 * When a route requires step-up auth, the client must present a valid
 * X-Step-Up-Token header for the specified category. Tokens are obtained
 * via POST /api/v1/auth/step-up after PIN verification.
 */

export const STEP_UP_CATEGORIES = {
  /** Irreversible financial operations: period close, account merge/renumber, voids */
  financial_critical: { label: 'Financial Critical', ttlMs: 5 * 60_000 },
  /** CSV/data export endpoints */
  data_export: { label: 'Data Export', ttlMs: 10 * 60_000 },
  /** Role grants, revocations, user permission changes */
  permission_mgmt: { label: 'Permission Management', ttlMs: 5 * 60_000 },
  /** COA imports, bulk remaps, data imports */
  bulk_operations: { label: 'Bulk Operations', ttlMs: 10 * 60_000 },
} as const;

export type StepUpCategory = keyof typeof STEP_UP_CATEGORIES;
