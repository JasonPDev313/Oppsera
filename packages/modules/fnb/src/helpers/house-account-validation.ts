import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

/**
 * CMAA-compliant house account validation helper.
 *
 * Used at tender execution time to re-validate the billing account
 * and enforce all CMAA controls that may have changed since the POS lookup.
 *
 * Gates enforced:
 *  1. Account status (active only)
 *  2. Collection status (normal only)
 *  3. Account type (house only)
 *  4. Member charge permission (charge_allowed)
 *  5. Credit limit (with available credit calculation)
 *  6. Minimum charge amount
 *  7. Maximum tip percentage
 *  8. Daily cumulative limit
 *  9. Monthly cumulative limit
 * 10. Charging hours (time-of-day restriction)
 */

interface HouseAccountValidationInput {
  billingAccountId: string;
  customerId: string;
  amountCents: number;
  tipCents: number;
}

interface HouseAccountValidationResult {
  billingAccountId: string;
  customerId: string;
  customerName: string;
  creditLimitCents: number;
  currentBalanceCents: number;
  availableCreditCents: number | null;
  maxTipPercentage: number | null;
}

export async function validateHouseAccountCharge(
  ctx: RequestContext,
  input: HouseAccountValidationInput,
): Promise<HouseAccountValidationResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    // ── Fetch account + member + customer in one query ──
    const rows = await tx.execute(
      sql`SELECT
            ba.status              AS account_status,
            ba.collection_status,
            ba.account_type,
            ba.credit_limit_cents,
            ba.current_balance_cents,
            ba.min_charge_cents,
            ba.max_tip_percentage,
            ba.daily_limit_cents,
            ba.monthly_limit_cents,
            ba.charging_hours_start,
            ba.charging_hours_end,
            c.display_name         AS customer_name,
            c.status               AS customer_status,
            bam.charge_allowed,
            bam.spending_limit_cents
          FROM billing_accounts ba
          INNER JOIN customers c ON c.id = ${input.customerId} AND c.tenant_id = ba.tenant_id
          LEFT JOIN billing_account_members bam
            ON bam.billing_account_id = ba.id
            AND bam.customer_id = ${input.customerId}
            AND bam.tenant_id = ba.tenant_id
          WHERE ba.id = ${input.billingAccountId}
            AND ba.tenant_id = ${ctx.tenantId}`,
    );

    const matches = Array.from(rows as Iterable<Record<string, unknown>>);
    if (matches.length === 0) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Billing account not found', 404);
    }

    const row = matches[0]!;
    const accountStatus = row.account_status as string;
    const collectionStatus = row.collection_status as string;
    const accountType = row.account_type as string;
    const customerStatus = row.customer_status as string;
    const chargeAllowed = row.charge_allowed as boolean | null;
    const creditLimitCents = Number(row.credit_limit_cents ?? 0);
    const currentBalanceCents = Number(row.current_balance_cents ?? 0);
    const minChargeCents = row.min_charge_cents != null ? Number(row.min_charge_cents) : null;
    const maxTipPct = row.max_tip_percentage != null ? Number(row.max_tip_percentage) : null;
    const dailyLimitCents = row.daily_limit_cents != null ? Number(row.daily_limit_cents) : null;
    const monthlyLimitCents = row.monthly_limit_cents != null ? Number(row.monthly_limit_cents) : null;
    const chargingStart = row.charging_hours_start as string | null;
    const chargingEnd = row.charging_hours_end as string | null;
    const spendingLimitCents = row.spending_limit_cents != null ? Number(row.spending_limit_cents) : null;

    // ── Gate 1: Customer active ──
    if (customerStatus !== 'active') {
      throw new AppError('CUSTOMER_INACTIVE', `Customer account is ${customerStatus}. House charges are not permitted.`, 403);
    }

    // ── Gate 2: Account active ──
    if (accountStatus !== 'active') {
      throw new AppError('ACCOUNT_SUSPENDED', `Billing account is ${accountStatus}. Contact the front office.`, 403);
    }

    // ── Gate 3: Not in collections ──
    if (collectionStatus !== 'normal') {
      throw new AppError('ACCOUNT_IN_COLLECTIONS', `Account is ${collectionStatus}. New charges are blocked.`, 403);
    }

    // ── Gate 4: House type ──
    if (accountType !== 'house') {
      throw new AppError('NOT_HOUSE_ACCOUNT', 'This is not a house account.', 403);
    }

    // ── Gate 5: Member charge permission ──
    if (chargeAllowed === false) {
      throw new AppError('CHARGE_NOT_ALLOWED', 'This member is not authorized to charge to this account.', 403);
    }

    // ── Gate 6: Minimum charge amount ──
    if (minChargeCents != null && input.amountCents < minChargeCents) {
      throw new AppError(
        'BELOW_MINIMUM_CHARGE',
        `Minimum charge is $${(minChargeCents / 100).toFixed(2)}. Current charge: $${(input.amountCents / 100).toFixed(2)}.`,
        400,
      );
    }

    // ── Gate 7: Maximum tip percentage ──
    if (maxTipPct != null && input.tipCents > 0 && input.amountCents > 0) {
      const tipPct = (input.tipCents / input.amountCents) * 100;
      if (tipPct > maxTipPct) {
        throw new AppError(
          'TIP_EXCEEDS_MAXIMUM',
          `Gratuity of ${tipPct.toFixed(1)}% exceeds maximum allowed ${maxTipPct.toFixed(1)}%. Manager override required.`,
          400,
        );
      }
    }

    // ── Gate 8: Charging hours (supports overnight wrap-around, e.g. 22:00–02:00) ──
    if (chargingStart && chargingEnd) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const wrapsOvernight = chargingStart > chargingEnd;
      const inWindow = wrapsOvernight
        ? currentTime >= chargingStart || currentTime <= chargingEnd
        : currentTime >= chargingStart && currentTime <= chargingEnd;
      if (!inWindow) {
        throw new AppError(
          'OUTSIDE_CHARGING_HOURS',
          `House account charges are only permitted between ${chargingStart} and ${chargingEnd}.`,
          403,
        );
      }
    }

    // ── Gate 9: Credit limit ──
    const totalChargeCents = input.amountCents + input.tipCents;
    const availableCreditCents = creditLimitCents > 0
      ? Math.max(0, creditLimitCents - currentBalanceCents)
      : null; // null = unlimited

    if (creditLimitCents > 0 && (currentBalanceCents + totalChargeCents) > creditLimitCents) {
      throw new AppError(
        'CREDIT_LIMIT_EXCEEDED',
        `Charge of $${(totalChargeCents / 100).toFixed(2)} would exceed credit limit. Available: $${((availableCreditCents ?? 0) / 100).toFixed(2)}.`,
        403,
      );
    }

    // ── Gate 10: Per-member spending limit ──
    if (spendingLimitCents != null && totalChargeCents > spendingLimitCents) {
      throw new AppError(
        'MEMBER_SPENDING_LIMIT_EXCEEDED',
        `Charge exceeds member spending limit of $${(spendingLimitCents / 100).toFixed(2)}.`,
        403,
      );
    }

    // ── Gate 11: Daily cumulative limit ──
    if (dailyLimitCents != null) {
      const dailyResult = await tx.execute(
        sql`SELECT COALESCE(SUM(
              CASE WHEN source_type = 'pos_house_account' THEN ROUND(total_amount * 100)::bigint ELSE 0 END
            ), 0)::bigint AS daily_total_cents
            FROM ar_invoices
            WHERE tenant_id = ${ctx.tenantId}
              AND billing_account_id = ${input.billingAccountId}
              AND invoice_date = CURRENT_DATE
              AND status != 'voided'`,
      );
      const dailyRows = Array.from(dailyResult as Iterable<Record<string, unknown>>);
      const dailyTotalCents = Number(dailyRows[0]?.daily_total_cents ?? 0);
      if (dailyTotalCents + totalChargeCents > dailyLimitCents) {
        throw new AppError(
          'DAILY_LIMIT_EXCEEDED',
          `Daily charge limit of $${(dailyLimitCents / 100).toFixed(2)} would be exceeded. Today's charges: $${(dailyTotalCents / 100).toFixed(2)}.`,
          403,
        );
      }
    }

    // ── Gate 12: Monthly cumulative limit ──
    if (monthlyLimitCents != null) {
      const monthlyResult = await tx.execute(
        sql`SELECT COALESCE(SUM(
              CASE WHEN source_type = 'pos_house_account' THEN ROUND(total_amount * 100)::bigint ELSE 0 END
            ), 0)::bigint AS monthly_total_cents
            FROM ar_invoices
            WHERE tenant_id = ${ctx.tenantId}
              AND billing_account_id = ${input.billingAccountId}
              AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
              AND status != 'voided'`,
      );
      const monthlyRows = Array.from(monthlyResult as Iterable<Record<string, unknown>>);
      const monthlyTotalCents = Number(monthlyRows[0]?.monthly_total_cents ?? 0);
      if (monthlyTotalCents + totalChargeCents > monthlyLimitCents) {
        throw new AppError(
          'MONTHLY_LIMIT_EXCEEDED',
          `Monthly charge limit of $${(monthlyLimitCents / 100).toFixed(2)} would be exceeded. This month's charges: $${(monthlyTotalCents / 100).toFixed(2)}.`,
          403,
        );
      }
    }

    return {
      billingAccountId: input.billingAccountId,
      customerId: input.customerId,
      customerName: row.customer_name as string,
      creditLimitCents,
      currentBalanceCents,
      availableCreditCents,
      maxTipPercentage: maxTipPct,
    };
  });
}
