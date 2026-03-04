import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

/**
 * PUBLIC: Guest confirms they are on their way after being notified.
 * No auth required — uses guest_token for identity.
 *
 * Sets confirmation_status = 'on_my_way' and optionally estimated_arrival_at.
 */
export async function confirmWaitlistArrival(
  tenantId: string,
  token: string,
  estimatedMinutes?: number,
): Promise<{ id: string; confirmationStatus: string; estimatedArrivalAt: string | null }> {
  const adminDb = createAdminClient();

  // Build estimated arrival time if provided
  const estimatedArrivalAt = estimatedMinutes
    ? new Date(Date.now() + estimatedMinutes * 60_000).toISOString()
    : null;

  const rows = await adminDb.execute(sql`
    UPDATE fnb_waitlist_entries
    SET confirmation_status = 'on_my_way',
        estimated_arrival_at = ${estimatedArrivalAt}::timestamptz,
        updated_at = now()
    WHERE tenant_id = ${tenantId}
      AND guest_token = ${token}
      AND status = 'notified'
    RETURNING id, confirmation_status, estimated_arrival_at
  `);

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 'Entry not found or not in notified status', 404);
  }

  return {
    id: String(row.id),
    confirmationStatus: String(row.confirmation_status),
    estimatedArrivalAt: row.estimated_arrival_at ? String(row.estimated_arrival_at) : null,
  };
}
