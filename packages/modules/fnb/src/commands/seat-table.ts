import type { RequestContext } from '@oppsera/core/auth/context';
import type { SeatTableInput } from '../validation';
import { updateTableStatus } from './update-table-status';

/**
 * High-level convenience command: seats a table.
 * Sets status to 'seated' with party size, server, and optional waitlist link.
 */
export async function seatTable(
  ctx: RequestContext,
  tableId: string,
  input: SeatTableInput,
) {
  return updateTableStatus(ctx, tableId, {
    clientRequestId: input.clientRequestId,
    status: 'seated',
    partySize: input.partySize,
    serverUserId: input.serverUserId,
    guestNames: input.guestNames,
    waitlistEntryId: input.waitlistEntryId,
    expectedVersion: input.expectedVersion,
  });
}
