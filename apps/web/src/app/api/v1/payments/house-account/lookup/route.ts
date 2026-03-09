import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { withTenant } from '@oppsera/db';

/**
 * GET /api/v1/payments/house-account/lookup?q=xxx
 *
 * Shared house account lookup for POS charging (retail + FnB).
 * Same CMAA-hardened logic as the FnB-specific route, but available
 * to any POS register with the `payments` entitlement.
 *
 * Search chain: customers + customer_identifiers → billing_account_members → billing_accounts
 *
 * Enforced CMAA controls:
 *  1. Customer status must be 'active'
 *  2. Billing account status must be 'active'
 *  3. Collection status must be 'normal' (accounts in collections are blocked)
 *  4. Account type must be 'house'
 *  5. Member-level charge_allowed must be true
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Search query "q" must be at least 2 characters' } },
        { status: 400 },
      );
    }
    if (q.length > 100) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Search query "q" exceeds maximum length' } },
        { status: 400 },
      );
    }
    // Reject null bytes (Postgres treats them as string terminators)
    if (q.includes('\0')) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Invalid search query' } },
        { status: 400 },
      );
    }

    const escapedQ = q.replace(/[%_\\]/g, '\\$&');
    const phoneDigits = q.replace(/[^0-9]/g, '');
    // Phone search only meaningful with 7+ digits and capped at 15 (ITU-T E.164 max)
    const hasPhoneDigits = phoneDigits.length >= 7 && phoneDigits.length <= 15;

    const tenantId = ctx.tenantId;

    const result = await withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT DISTINCT ON (c.id)
                   c.id              AS customer_id,
                   c.display_name    AS customer_name,
                   c.status          AS customer_status,
                   c.member_number,
                   ba.id             AS billing_account_id,
                   ba.name           AS account_name,
                   ba.status         AS account_status,
                   ba.collection_status,
                   ba.credit_limit_cents,
                   ba.current_balance_cents,
                   ba.account_type,
                   bam.charge_allowed,
                   bam.spending_limit_cents,
                   CASE
                     WHEN c.member_number = ${q} OR ci.value = ${q} THEN 1
                     WHEN LOWER(c.email) = LOWER(${q}) THEN 2
                     WHEN ${hasPhoneDigits} AND REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') = ${phoneDigits} THEN 3
                     ELSE 4
                   END AS match_rank
            FROM customers c
            LEFT JOIN customer_identifiers ci
              ON ci.customer_id = c.id
              AND ci.tenant_id = c.tenant_id
              AND ci.type = 'member_number'
              AND ci.is_active = true
            INNER JOIN billing_account_members bam
              ON bam.customer_id = c.id
              AND bam.tenant_id = c.tenant_id
            INNER JOIN billing_accounts ba
              ON ba.id = bam.billing_account_id
              AND ba.tenant_id = c.tenant_id
            WHERE c.tenant_id = ${tenantId}
              AND (
                c.member_number = ${q}
                OR ci.value = ${q}
                OR LOWER(c.email) = LOWER(${q})
                OR (${hasPhoneDigits} AND REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') = ${phoneDigits})
                OR c.display_name ILIKE ${`%${escapedQ}%`} ESCAPE '\\'
              )
            ORDER BY c.id, ba.account_type = 'house' DESC, ba.status = 'active' DESC, ba.created_at ASC
            LIMIT 10`,
      );

      const matches = Array.from(rows as Iterable<Record<string, unknown>>);
      if (matches.length === 0) return null;

      matches.sort((a, b) => Number(a.match_rank) - Number(b.match_rank));

      const results: Array<
        | { blocked: true; code: string; message: string; customerId: string; customerName: string }
        | {
            blocked: false;
            customerId: string;
            customerName: string;
            memberNumber: string | null;
            billingAccountId: string;
            accountName: string;
            creditLimitCents: number;
            outstandingBalanceCents: number;
            availableCreditCents: number | null;
            spendingLimitCents: number | null;
          }
      > = [];

      for (const row of matches) {
        const customerStatus = row.customer_status as string;
        const accountStatus = row.account_status as string;
        const collectionStatus = row.collection_status as string;
        const accountType = row.account_type as string;
        const chargeAllowed = row.charge_allowed as boolean;
        const creditLimitCents = Number(row.credit_limit_cents ?? 0);
        const outstandingBalanceCents = Number(row.current_balance_cents ?? 0);
        const spendingLimitCents = row.spending_limit_cents != null
          ? Number(row.spending_limit_cents)
          : null;
        const customerId = row.customer_id as string;
        const customerName = row.customer_name as string;

        if (customerStatus !== 'active') {
          results.push({
            blocked: true, code: 'CUSTOMER_INACTIVE',
            message: `Customer account is ${customerStatus}. House charges are not permitted.`,
            customerId, customerName,
          });
          continue;
        }

        if (accountStatus !== 'active') {
          results.push({
            blocked: true, code: 'ACCOUNT_SUSPENDED',
            message: `Billing account is ${accountStatus}. Contact the front office.`,
            customerId, customerName,
          });
          continue;
        }

        if (collectionStatus !== 'normal') {
          const labels: Record<string, string> = {
            reminder_sent: 'past due (reminder sent)',
            final_notice: 'past due (final notice)',
            sent_to_collections: 'in collections',
          };
          results.push({
            blocked: true, code: 'ACCOUNT_IN_COLLECTIONS',
            message: `Account is ${labels[collectionStatus] ?? collectionStatus}. New charges are blocked.`,
            customerId, customerName,
          });
          continue;
        }

        if (accountType !== 'house') {
          results.push({
            blocked: true, code: 'NOT_HOUSE_ACCOUNT',
            message: 'No house account on file for this customer.',
            customerId, customerName,
          });
          continue;
        }

        if (!chargeAllowed) {
          results.push({
            blocked: true, code: 'CHARGE_NOT_ALLOWED',
            message: 'This member is not authorized to charge to this account.',
            customerId, customerName,
          });
          continue;
        }

        results.push({
          blocked: false,
          customerId,
          customerName,
          memberNumber: (row.member_number as string) ?? null,
          billingAccountId: row.billing_account_id as string,
          accountName: row.account_name as string,
          creditLimitCents,
          outstandingBalanceCents,
          availableCreditCents: creditLimitCents > 0
            ? Math.max(0, creditLimitCents - outstandingBalanceCents)
            : null,
          spendingLimitCents,
        });
      }

      return results;
    });

    // Audit log every lookup (CMAA accountability)
    const matchCount = result?.length ?? 0;
    const chargeableCount = result?.filter(r => !r.blocked).length ?? 0;
    auditLogDeferred(ctx, 'house_account.lookup', 'house_account', 'search', undefined, {
      query: q.substring(0, 50),
      matchCount,
      chargeableCount,
      source: 'retail_pos',
    });

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Customer not found or no house account on file' } },
        { status: 404 },
      );
    }

    if (result.length === 1) {
      const single = result[0]!;
      if (single.blocked) {
        return NextResponse.json(
          { error: { code: single.code, message: single.message } },
          { status: 403 },
        );
      }
      return NextResponse.json({ data: single });
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
