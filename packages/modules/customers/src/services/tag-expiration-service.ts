/**
 * Tag Expiration Service
 *
 * Processes customer tags that have passed their `expires_at` timestamp.
 * Soft-removes expired tags and records evidence of expiration.
 * Called from the cron route (Session 3).
 */

import { eq, and, isNull, lte, sql } from 'drizzle-orm';
import { customerTags, tags, tagAuditLog } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpiredTagResult {
  customerTagId: string;
  customerId: string;
  tagId: string;
  tagName: string;
  expiresAt: string;
}

export interface ProcessExpiredTagsResult {
  processed: number;
  expired: ExpiredTagResult[];
}

// ── Expiration Processor ──────────────────────────────────────────────────────

/**
 * Find and soft-remove all expired customer tags for a tenant.
 *
 * Steps:
 * 1. Query `customer_tags` where `expires_at <= now() AND removed_at IS NULL`
 * 2. Soft-remove each by setting `removed_at`, `removed_by`, `removed_reason`
 * 3. Record in `tag_audit_log`
 * 4. Return list of expired tags (for cron route to fire on_expire actions)
 *
 * @param tx - Transaction handle (from withTenant)
 * @param tenantId - Tenant ID
 * @param batchSize - Max number of expired tags to process (default 100)
 */
export async function processExpiredTags(
  tx: any,
  tenantId: string,
  batchSize = 100,
): Promise<ProcessExpiredTagsResult> {
  const now = new Date();

  // 1. Find expired tags (join with tags table to get tag name)
  const expiredRows = await tx
    .select({
      customerTagId: customerTags.id,
      customerId: customerTags.customerId,
      tagId: customerTags.tagId,
      expiresAt: customerTags.expiresAt,
      tagName: tags.name,
    })
    .from(customerTags)
    .innerJoin(tags, eq(tags.id, customerTags.tagId))
    .where(
      and(
        eq(customerTags.tenantId, tenantId),
        isNull(customerTags.removedAt),
        lte(customerTags.expiresAt, now),
      ),
    )
    .limit(batchSize);

  if (expiredRows.length === 0) {
    return { processed: 0, expired: [] };
  }

  const expired: ExpiredTagResult[] = [];

  // 2. Soft-remove each expired tag
  for (const row of expiredRows) {
    await tx
      .update(customerTags)
      .set({
        removedAt: now,
        removedBy: 'system:expiration',
        removedReason: 'Tag expired',
      })
      .where(eq(customerTags.id, row.customerTagId));

    // 3. Audit log
    await tx.insert(tagAuditLog).values({
      id: generateUlid(),
      tenantId,
      customerId: row.customerId,
      tagId: row.tagId,
      action: 'expired',
      source: 'system',
      actorId: 'system:expiration',
      evidence: {
        reason: 'Tag expired',
        expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
        processedAt: now.toISOString(),
      },
    });

    expired.push({
      customerTagId: row.customerTagId,
      customerId: row.customerId,
      tagId: row.tagId,
      tagName: row.tagName,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
    });
  }

  // 4. Decrement customer counts for expired tags
  const tagIdCounts = new Map<string, number>();
  for (const e of expired) {
    tagIdCounts.set(e.tagId, (tagIdCounts.get(e.tagId) ?? 0) + 1);
  }
  for (const [tagId, count] of tagIdCounts) {
    await tx
      .update(tags)
      .set({
        customerCount: sql`GREATEST(${tags.customerCount} - ${count}, 0)`,
        updatedAt: now,
      })
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, tagId)));
  }

  return { processed: expired.length, expired };
}

/**
 * Compute expiry date for a new tag assignment based on the tag's `default_expiry_days`.
 * Returns null if the tag has no default expiry.
 */
export function computeExpiryDate(
  defaultExpiryDays: number | null | undefined,
  fromDate?: Date,
): Date | null {
  if (!defaultExpiryDays || defaultExpiryDays <= 0) return null;
  const base = fromDate ?? new Date();
  return new Date(base.getTime() + defaultExpiryDays * 86400000);
}
