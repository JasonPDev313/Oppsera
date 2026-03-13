import type { Database } from '@oppsera/db';
import { PermanentPostingError } from '@oppsera/shared';
import { logUnmappedEvent } from './resolve-mapping';
import type { UnmappedEventParams } from './resolve-mapping';

/**
 * Standardised GL adapter catch-block handler.
 *
 * 1. Logs the error to `gl_unmapped_events` (best-effort).
 * 2. Swallows `PermanentPostingError` — retry won't help.
 * 3. Re-throws transient errors so the outbox retries the event.
 */
export async function handleGlPostingError(
  error: unknown,
  db: Database,
  tenantId: string,
  params: Omit<UnmappedEventParams, 'entityType' | 'reason'>,
  logPrefix: string,
): Promise<void> {
  console.error(`[${logPrefix}] GL posting failed for ${params.sourceReferenceId}:`, error);
  try {
    await logUnmappedEvent(db, tenantId, {
      ...params,
      entityType: error instanceof PermanentPostingError ? 'permanent_posting_error' : 'transient_posting_error',
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  } catch { /* best-effort tracking */ }
  if (error instanceof PermanentPostingError) return;
  throw error;
}
