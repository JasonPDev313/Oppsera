// ── Semantic Layer — RBAC Entitlement Defaults ────────────────────
//
// Maps system roles to the default permissions for the 'semantic'
// module. Import this from your tenant provisioning flow to set up
// sensible defaults. Individual permissions can be overridden per
// tenant after provisioning.
//
// Usage:
//   import { SEMANTIC_ROLE_PERMISSIONS } from '@oppsera/module-semantic/setup/register-entitlements';
//   for (const [role, permissions] of Object.entries(SEMANTIC_ROLE_PERMISSIONS)) {
//     await grantPermissions(tenantId, role, permissions);
//   }

// ── Permission constants ───────────────────────────────────────────

export const SEMANTIC_PERMISSIONS = {
  // Core query permissions
  QUERY: 'semantic.query',          // Execute natural-language queries (ask / query endpoints)
  CHAT: 'semantic.chat',            // Access the conversational chat UI
  EXPORT: 'semantic.export',        // Export query results as CSV

  // Lens management
  LENSES_VIEW: 'semantic.lenses.view',    // List and view custom lenses
  LENSES_MANAGE: 'semantic.lenses.manage', // Create, update, delete tenant lenses

  // History and evaluation
  HISTORY: 'semantic.history',      // View own query history

  // Admin operations (typically Owner only)
  ADMIN: 'semantic.admin',          // Cache invalidation, metrics, eval feed management
} as const;

export type SemanticPermission = (typeof SEMANTIC_PERMISSIONS)[keyof typeof SEMANTIC_PERMISSIONS];

// ── Default role→permission mappings ──────────────────────────────
//
// Principle of least privilege:
//   - Staff / Cashier / Server:  query only (no history, no lenses)
//   - Supervisor:                query + chat + history + lenses.view
//   - Manager:                   all of the above + export + lenses.manage
//   - Owner:                     all semantic permissions

export const SEMANTIC_ROLE_PERMISSIONS: Record<string, SemanticPermission[]> = {
  owner: [
    SEMANTIC_PERMISSIONS.QUERY,
    SEMANTIC_PERMISSIONS.CHAT,
    SEMANTIC_PERMISSIONS.EXPORT,
    SEMANTIC_PERMISSIONS.LENSES_VIEW,
    SEMANTIC_PERMISSIONS.LENSES_MANAGE,
    SEMANTIC_PERMISSIONS.HISTORY,
    SEMANTIC_PERMISSIONS.ADMIN,
  ],
  manager: [
    SEMANTIC_PERMISSIONS.QUERY,
    SEMANTIC_PERMISSIONS.CHAT,
    SEMANTIC_PERMISSIONS.EXPORT,
    SEMANTIC_PERMISSIONS.LENSES_VIEW,
    SEMANTIC_PERMISSIONS.LENSES_MANAGE,
    SEMANTIC_PERMISSIONS.HISTORY,
  ],
  supervisor: [
    SEMANTIC_PERMISSIONS.QUERY,
    SEMANTIC_PERMISSIONS.CHAT,
    SEMANTIC_PERMISSIONS.LENSES_VIEW,
    SEMANTIC_PERMISSIONS.HISTORY,
  ],
  cashier: [
    SEMANTIC_PERMISSIONS.QUERY,
  ],
  server: [
    SEMANTIC_PERMISSIONS.QUERY,
  ],
  staff: [
    SEMANTIC_PERMISSIONS.QUERY,
  ],
};
