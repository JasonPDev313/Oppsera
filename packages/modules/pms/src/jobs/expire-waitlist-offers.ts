/**
 * PMS Background Job: Expire Stale Waitlist Offers
 *
 * Expires waitlist offers whose offerExpiresAt has passed.
 *
 * Schedule: Every 15 minutes (or on-demand via cron route)
 * Idempotent: only updates entries in 'offered' status with expired timestamps
 */
import { withTenant, sql } from '@oppsera/db';

export interface ExpireWaitlistResult {
  propertyId: string;
  expiredCount: number;
}

export async function runExpireWaitlistOffers(
  tenantId: string,
  propertyId: string,
): Promise<ExpireWaitlistResult> {
  let expiredCount = 0;

  await withTenant(tenantId, async (tx) => {
    const result = await tx.execute(sql`
      UPDATE pms_waitlist
      SET status = 'expired', updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND status = 'offered'
        AND offer_expires_at IS NOT NULL
        AND offer_expires_at <= NOW()
    `);

    expiredCount = (result as { rowCount?: number }).rowCount ?? 0;
  });

  if (expiredCount > 0) {
    console.log(
      `[pms.expire-waitlist-offers] property=${propertyId} expired=${expiredCount}`,
    );
  }

  return { propertyId, expiredCount };
}
