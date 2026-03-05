import { eq, and } from 'drizzle-orm';
import { idempotencyKeys } from '@oppsera/db';
import type { Database } from '@oppsera/db';

/**
 * Atomically check and reserve an idempotency key.
 *
 * Phase 1: Check if a completed (non-expired) key exists → return its result.
 * Phase 2: INSERT with ON CONFLICT DO NOTHING → only one concurrent winner gets a row back.
 *          Losers see 0 rows returned and are told it's a duplicate.
 *
 * This closes the TOCTOU race where two concurrent requests both pass a SELECT check
 * before either writes the key.
 */
export async function checkIdempotency(
  txOrDb: Database,
  tenantId: string,
  clientRequestId: string | undefined,
  commandName: string,
): Promise<{ isDuplicate: boolean; originalResult?: unknown }> {
  if (!clientRequestId) return { isDuplicate: false };

  // 1. Check for a completed (non-expired) key with a real result.
  // Filter by commandName to prevent cross-command cache hits (e.g., same clientRequestId
  // used for both compOrderLine and voidOrderLine would return the wrong cached result).
  const [existing] = await (txOrDb as any).select().from(idempotencyKeys).where(
    and(
      eq(idempotencyKeys.tenantId, tenantId),
      eq(idempotencyKeys.clientRequestId, clientRequestId),
      eq(idempotencyKeys.commandName, commandName),
    ),
  );

  if (existing && existing.expiresAt > new Date()) {
    // If it has a real result, return it. If it's a pending reservation from
    // a concurrent in-flight request, treat as duplicate (no result to return).
    return { isDuplicate: true, originalResult: existing.resultPayload };
  }

  // 2. Atomically reserve the key — only one concurrent request wins the insert
  const inserted = await (txOrDb as any).insert(idempotencyKeys).values({
    tenantId,
    clientRequestId,
    commandName,
    resultPayload: { __pending: true } as Record<string, unknown>,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).onConflictDoNothing().returning({ id: idempotencyKeys.id });

  if (inserted.length === 0) {
    // Lost the race — another transaction reserved this key first
    return { isDuplicate: true };
  }

  return { isDuplicate: false };
}

/**
 * Update the idempotency key with the actual result payload after business logic completes.
 */
export async function saveIdempotencyKey(
  tx: Database,
  tenantId: string,
  clientRequestId: string | undefined,
  commandName: string,
  resultPayload: unknown,
): Promise<void> {
  if (!clientRequestId) return;

  // Update the reserved key with the real result.
  // Filter by commandName to prevent cross-command result corruption when the same
  // clientRequestId is reused across different commands.
  await (tx as any).update(idempotencyKeys).set({
    resultPayload: resultPayload as Record<string, unknown>,
  }).where(
    and(
      eq(idempotencyKeys.tenantId, tenantId),
      eq(idempotencyKeys.clientRequestId, clientRequestId),
      eq(idempotencyKeys.commandName, commandName),
    ),
  );
}
