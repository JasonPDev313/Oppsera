/**
 * Account change log service.
 *
 * Append-only field-level change tracking for GL accounts.
 * Pattern matches catalog item change logs.
 */

import { eq, and, desc, lt } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { glAccountChangeLogs } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export type ChangeAction = 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE' | 'MERGE' | 'RENUMBER';

export interface AccountChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface LogAccountChangeParams {
  tenantId: string;
  accountId: string;
  action: ChangeAction;
  changes: AccountChange[];
  changedBy: string;
  metadata?: Record<string, unknown>;
}

/** Log a change to an account. Inserts one row per changed field. */
export async function logAccountChange(
  tx: Database,
  params: LogAccountChangeParams,
): Promise<void> {
  if (params.action === 'CREATE') {
    // Single row for CREATE
    await tx.insert(glAccountChangeLogs).values({
      id: generateUlid(),
      tenantId: params.tenantId,
      accountId: params.accountId,
      action: params.action,
      fieldChanged: null,
      oldValue: null,
      newValue: null,
      changedBy: params.changedBy,
      metadata: params.metadata ?? null,
    });
    return;
  }

  // One row per field change
  for (const change of params.changes) {
    await tx.insert(glAccountChangeLogs).values({
      id: generateUlid(),
      tenantId: params.tenantId,
      accountId: params.accountId,
      action: params.action,
      fieldChanged: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changedBy: params.changedBy,
      metadata: params.metadata ?? null,
    });
  }
}

/** Compute field-level diff between two account snapshots. */
export function computeAccountDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AccountChange[] {
  const changes: AccountChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    // Skip internal fields
    if (['id', 'tenantId', 'createdAt', 'updatedAt'].includes(key)) continue;

    const oldVal = before[key];
    const newVal = after[key];

    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({
        field: key,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
      });
    }
  }

  return changes;
}

export interface ChangeLogEntry {
  id: string;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: Date | null;
  metadata: unknown;
}

/** Query change log for an account with cursor pagination. */
export async function getAccountChangeLog(
  tx: Database,
  tenantId: string,
  accountId: string,
  cursor?: string,
  limit: number = 50,
): Promise<{ entries: ChangeLogEntry[]; hasMore: boolean }> {
  const conditions = [
    eq(glAccountChangeLogs.tenantId, tenantId),
    eq(glAccountChangeLogs.accountId, accountId),
  ];

  if (cursor) {
    conditions.push(lt(glAccountChangeLogs.id, cursor));
  }

  const rows = await tx
    .select()
    .from(glAccountChangeLogs)
    .where(and(...conditions))
    .orderBy(desc(glAccountChangeLogs.changedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    action: r.action,
    fieldChanged: r.fieldChanged,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedBy: r.changedBy,
    changedAt: r.changedAt,
    metadata: r.metadata,
  }));

  return { entries, hasMore };
}
