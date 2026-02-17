import { eq, and } from 'drizzle-orm';
import { idempotencyKeys } from '@oppsera/db';
import type { Database } from '@oppsera/db';

export async function checkIdempotency(
  txOrDb: Database,
  tenantId: string,
  clientRequestId: string | undefined,
  _commandName: string,
): Promise<{ isDuplicate: boolean; originalResult?: unknown }> {
  if (!clientRequestId) return { isDuplicate: false };

  const [existing] = await (txOrDb as any).select().from(idempotencyKeys).where(
    and(
      eq(idempotencyKeys.tenantId, tenantId),
      eq(idempotencyKeys.clientRequestId, clientRequestId),
    ),
  );

  if (existing && existing.expiresAt > new Date()) {
    return { isDuplicate: true, originalResult: existing.resultPayload };
  }
  return { isDuplicate: false };
}

export async function saveIdempotencyKey(
  tx: Database,
  tenantId: string,
  clientRequestId: string | undefined,
  commandName: string,
  resultPayload: unknown,
): Promise<void> {
  if (!clientRequestId) return;

  await (tx as any).insert(idempotencyKeys).values({
    tenantId,
    clientRequestId,
    commandName,
    resultPayload: resultPayload as Record<string, unknown>,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).onConflictDoNothing();
}
