import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CorporateRateResult {
  corporateAccountId: string;
  roomTypeId: string;
  negotiatedRateCents: number | null;
  negotiatedDiscountPct: number | null;
  source: 'override' | 'discount' | 'none';
}

/**
 * Resolves the best negotiated rate for a corporate account + room type.
 *
 * Resolution order:
 * 1. Specific rate override for the room type (date-bounded if applicable)
 * 2. Account-level negotiated discount percentage (applied to base rate by caller)
 * 3. No negotiated rate
 */
export async function getCorporateRate(
  tenantId: string,
  accountId: string,
  roomTypeId: string,
  date?: string,
): Promise<CorporateRateResult> {
  return withTenant(tenantId, async (tx) => {
    // 1. Check for a date-specific rate override
    const dateCondition = date
      ? sql`AND (o.start_date IS NULL OR o.start_date <= ${date})
            AND (o.end_date IS NULL OR o.end_date >= ${date})`
      : sql`AND o.start_date IS NULL AND o.end_date IS NULL`;

    const overrideRows = await tx.execute(sql`
      SELECT o.negotiated_rate_cents
      FROM pms_corporate_rate_overrides o
      WHERE o.tenant_id = ${tenantId}
        AND o.corporate_account_id = ${accountId}
        AND o.room_type_id = ${roomTypeId}
        ${dateCondition}
      ORDER BY o.start_date ASC NULLS LAST
      LIMIT 1
    `);

    const overrideArr = Array.from(overrideRows as Iterable<Record<string, unknown>>);
    if (overrideArr.length > 0) {
      return {
        corporateAccountId: accountId,
        roomTypeId,
        negotiatedRateCents: Number(overrideArr[0]!.negotiated_rate_cents),
        negotiatedDiscountPct: null,
        source: 'override' as const,
      };
    }

    // 2. Fall back to account-level discount percentage
    const accountRows = await tx.execute(sql`
      SELECT negotiated_discount_pct
      FROM pms_corporate_accounts
      WHERE tenant_id = ${tenantId}
        AND id = ${accountId}
      LIMIT 1
    `);

    const accountArr = Array.from(accountRows as Iterable<Record<string, unknown>>);
    if (accountArr.length > 0 && accountArr[0]!.negotiated_discount_pct != null) {
      return {
        corporateAccountId: accountId,
        roomTypeId,
        negotiatedRateCents: null,
        negotiatedDiscountPct: Number(accountArr[0]!.negotiated_discount_pct),
        source: 'discount' as const,
      };
    }

    // 3. No negotiated rate
    return {
      corporateAccountId: accountId,
      roomTypeId,
      negotiatedRateCents: null,
      negotiatedDiscountPct: null,
      source: 'none' as const,
    };
  });
}
