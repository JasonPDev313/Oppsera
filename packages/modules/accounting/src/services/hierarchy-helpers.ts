/**
 * Hierarchy helpers for GL account tree operations.
 *
 * - computeDepth: walk parent chain → integer depth
 * - computePath: materialized path "10000.10010.10020"
 * - detectCircularReference: DFS cycle detection
 * - getDescendants: all children recursively
 * - recomputeHierarchyFields: batch recompute depth + path for all accounts
 */

import { eq } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { glAccounts } from '@oppsera/db';

export interface AccountNode {
  id: string;
  accountNumber: string;
  parentAccountId: string | null;
}

/** Walk parent chain and return depth (root = 0). */
export function computeDepth(
  accountId: string,
  accounts: AccountNode[],
): number {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let depth = 0;
  let current = byId.get(accountId);
  while (current?.parentAccountId) {
    depth++;
    current = byId.get(current.parentAccountId);
    if (depth > 10) break; // safety cap
  }
  return depth;
}

/** Build materialized path as "10000.10010.10020" (root-to-leaf account numbers). */
export function computePath(
  accountId: string,
  accounts: AccountNode[],
): string {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const segments: string[] = [];
  let current = byId.get(accountId);
  while (current) {
    segments.unshift(current.accountNumber);
    current = current.parentAccountId ? byId.get(current.parentAccountId) : undefined;
    if (segments.length > 10) break; // safety cap
  }
  return segments.join('.');
}

/**
 * Detect if setting `accountId.parentAccountId = parentId` would create a cycle.
 * Returns true if a cycle would be created.
 */
export function detectCircularReference(
  accountId: string,
  parentId: string,
  accounts: AccountNode[],
): boolean {
  if (accountId === parentId) return true;

  const byId = new Map(accounts.map((a) => [a.id, a]));
  // Walk from proposed parent up — if we reach accountId, it's a cycle
  let current: string | undefined = parentId;
  const visited = new Set<string>();
  while (current) {
    if (current === accountId) return true;
    if (visited.has(current)) return false; // already-existing cycle (shouldn't happen)
    visited.add(current);
    const node = byId.get(current);
    current = node?.parentAccountId ?? undefined;
  }
  return false;
}

/** Get all descendant account IDs recursively. */
export function getDescendants(
  accountId: string,
  accounts: AccountNode[],
): AccountNode[] {
  const childrenOf = new Map<string, AccountNode[]>();
  for (const a of accounts) {
    if (a.parentAccountId) {
      const siblings = childrenOf.get(a.parentAccountId) ?? [];
      siblings.push(a);
      childrenOf.set(a.parentAccountId, siblings);
    }
  }

  const result: AccountNode[] = [];
  const stack = [accountId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const children = childrenOf.get(id) ?? [];
    for (const child of children) {
      result.push(child);
      stack.push(child.id);
    }
  }
  return result;
}

/**
 * Batch recompute depth + path for all accounts of a tenant.
 * Call this after parent changes or imports.
 */
export async function recomputeHierarchyFields(
  tx: Database,
  tenantId: string,
): Promise<number> {
  const allAccounts = await tx
    .select({
      id: glAccounts.id,
      accountNumber: glAccounts.accountNumber,
      parentAccountId: glAccounts.parentAccountId,
    })
    .from(glAccounts)
    .where(eq(glAccounts.tenantId, tenantId));

  let updated = 0;
  for (const acct of allAccounts) {
    const depth = computeDepth(acct.id, allAccounts);
    const path = computePath(acct.id, allAccounts);

    await tx
      .update(glAccounts)
      .set({ depth, path })
      .where(eq(glAccounts.id, acct.id));

    updated++;
  }

  return updated;
}
