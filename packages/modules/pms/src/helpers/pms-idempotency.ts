/**
 * PMS-specific idempotency helpers using pms_idempotency_keys table.
 * Used for calendar move/resize operations.
 */
import { eq, and, gt } from 'drizzle-orm';
import { pmsIdempotencyKeys } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export async function checkPmsIdempotency(
  tx: any,
  tenantId: string,
  key: string,
): Promise<{ isDuplicate: boolean; cachedResponse?: unknown }> {
  const [existing] = await tx
    .select()
    .from(pmsIdempotencyKeys)
    .where(
      and(
        eq(pmsIdempotencyKeys.tenantId, tenantId),
        eq(pmsIdempotencyKeys.key, key),
        gt(pmsIdempotencyKeys.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing) {
    return { isDuplicate: true, cachedResponse: existing.responseJson };
  }
  return { isDuplicate: false };
}

export async function savePmsIdempotencyKey(
  tx: any,
  tenantId: string,
  key: string,
  command: string,
  response: unknown,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await tx.insert(pmsIdempotencyKeys).values({
    id: generateUlid(),
    tenantId,
    key,
    command,
    responseJson: response,
    expiresAt,
  });
}
