/**
 * Catalog Item Change Log — append-only audit trail for catalog items.
 *
 * Provides:
 *   - computeItemDiff(): field-level diff between before/after states
 *   - logItemChange(): transactional insert into catalog_item_change_logs
 *   - FIELD_DISPLAY: human-readable field name mapping for the UI
 */

import { catalogItemChangeLogs } from '../schema';

// ── Types ───────────────────────────────────────────────────────

export type ActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'ARCHIVED'
  | 'RESTORED'
  | 'COST_UPDATED'
  | 'INVENTORY_ADJUSTED'
  | 'IMPORTED';

export type ChangeSource = 'UI' | 'API' | 'IMPORT' | 'SYSTEM';

export interface FieldChange {
  old: unknown;
  new: unknown;
}

export interface ChangeLogEntry {
  id: string;
  itemId: string;
  actionType: ActionType;
  changedByUserId: string;
  changedByName: string | null;
  changedAt: string;
  source: ChangeSource;
  fieldChanges: Record<string, FieldChange>;
  summary: string | null;
  notes: string | null;
}

// ── Constants ───────────────────────────────────────────────────

/** Fields excluded from diff computation — metadata fields that always change on mutation */
const IGNORED_FIELDS = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
];

/** Maps internal field names to human-readable labels and format hints */
export const FIELD_DISPLAY: Record<
  string,
  { label: string; format?: 'currency' | 'date' | 'boolean' | 'lookup' | 'text' }
> = {
  name: { label: 'Item Name', format: 'text' },
  defaultPrice: { label: 'Price', format: 'currency' },
  cost: { label: 'Unit Cost', format: 'currency' },
  sku: { label: 'SKU', format: 'text' },
  barcode: { label: 'Barcode', format: 'text' },
  categoryId: { label: 'Category', format: 'lookup' },
  taxCategoryId: { label: 'Tax Category', format: 'lookup' },
  isTrackable: { label: 'Track Inventory', format: 'boolean' },
  itemType: { label: 'Item Type', format: 'text' },
  description: { label: 'Description', format: 'text' },
  archivedAt: { label: 'Archived', format: 'date' },
  archivedBy: { label: 'Archived By', format: 'text' },
  archivedReason: { label: 'Archive Reason', format: 'text' },
  metadata: { label: 'Configuration', format: 'text' },
};

// ── Diff Utility ────────────────────────────────────────────────

/**
 * Compute field-level changes between two item states.
 *
 * - If `before` is null → creation snapshot: every `after` field becomes { old: null, new: value }
 * - Only includes fields that actually changed (JSON.stringify comparison)
 * - Skips IGNORED_FIELDS
 * - Returns null if nothing changed (caller should skip the insert)
 */
export function computeItemDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, FieldChange> | null {
  const changes: Record<string, FieldChange> = {};

  if (before === null) {
    // Creation snapshot — record all initial values
    for (const key of Object.keys(after)) {
      if (IGNORED_FIELDS.includes(key)) continue;
      const val = after[key];
      // Skip undefined values (not meaningful for snapshot)
      if (val === undefined) continue;
      changes[key] = { old: null, new: val };
    }
  } else {
    // Diff — compare each field
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (IGNORED_FIELDS.includes(key)) continue;
      const oldVal = before[key];
      const newVal = after[key];
      // Skip if both undefined
      if (oldVal === undefined && newVal === undefined) continue;
      // Compare via JSON.stringify to handle objects/arrays/nulls correctly
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal ?? null, new: newVal ?? null };
      }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

// ── Log Utility ─────────────────────────────────────────────────

interface LogItemChangeParams {
  tenantId: string;
  itemId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  userId: string;
  actionType: ActionType;
  source: ChangeSource;
  summary?: string;
  notes?: string;
}

/**
 * Insert a change log entry inside the same transaction as the mutation.
 * Skips insert if no fields actually changed (empty diff).
 */
export async function logItemChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: LogItemChangeParams,
): Promise<void> {
  const fieldChanges = computeItemDiff(params.before, params.after);

  // No actual changes — skip the insert entirely
  if (!fieldChanges) return;

  // Auto-generate summary from changed field names if not provided
  const summary =
    params.summary ??
    generateSummary(params.actionType, Object.keys(fieldChanges));

  await tx.insert(catalogItemChangeLogs).values({
    tenantId: params.tenantId,
    itemId: params.itemId,
    actionType: params.actionType,
    changedByUserId: params.userId,
    source: params.source,
    fieldChanges,
    summary,
    notes: params.notes ?? null,
  });
}

/**
 * Build a human-readable summary from action type + changed field names.
 */
function generateSummary(actionType: ActionType, changedFields: string[]): string {
  switch (actionType) {
    case 'CREATED':
      return 'Created item';
    case 'ARCHIVED':
      return 'Archived item';
    case 'RESTORED':
      return 'Restored item';
    case 'COST_UPDATED':
      return 'Cost updated';
    case 'INVENTORY_ADJUSTED':
      return 'Inventory adjusted';
    case 'IMPORTED':
      return 'Imported item';
    case 'UPDATED': {
      const labels = changedFields
        .map((f) => FIELD_DISPLAY[f]?.label ?? f)
        .slice(0, 5); // cap at 5 to keep it readable
      const suffix = changedFields.length > 5 ? ` +${changedFields.length - 5} more` : '';
      return `Updated ${labels.join(', ')}${suffix}`;
    }
    default:
      return 'Item changed';
  }
}
