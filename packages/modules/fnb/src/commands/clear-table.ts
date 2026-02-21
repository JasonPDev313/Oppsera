import type { RequestContext } from '@oppsera/core/auth/context';
import { updateTableStatus } from './update-table-status';

/**
 * Marks a table as 'dirty' (bussing needed), then optionally as 'available'.
 * Common flow: paid → dirty → available
 */
export async function clearTable(
  ctx: RequestContext,
  tableId: string,
  options?: {
    clientRequestId?: string;
    markAvailable?: boolean;
    expectedVersion?: number;
  },
) {
  const dirtyResult = await updateTableStatus(ctx, tableId, {
    clientRequestId: options?.clientRequestId,
    status: 'dirty',
    expectedVersion: options?.expectedVersion,
  });

  if (options?.markAvailable) {
    return updateTableStatus(ctx, tableId, {
      status: 'available',
      expectedVersion: dirtyResult.version,
    });
  }

  return dirtyResult;
}
